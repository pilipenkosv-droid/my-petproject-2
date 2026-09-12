/**
 * DocxPackage — the zip container of a .docx, opened once and saved once.
 *
 * Reading goes through JSZip (it handles STORE/DEFLATE and data descriptors);
 * writing goes through the raw splicer in ./zip.ts, so entries that were never
 * marked dirty come out byte-for-byte identical to the input.
 */

import JSZip from "jszip";
import { parseDocxXml, buildDocxXml, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { readZipIndex, writeZip, type ZipIndex } from "./zip";
import type { ContentPartKind, ContentPartRef, PartName } from "../types";

const CT_BASE = "application/vnd.openxmlformats-officedocument.wordprocessingml.";

const CONTENT_TYPE_KINDS: Record<string, ContentPartKind> = {
  [`${CT_BASE}document.main+xml`]: "document",
  "application/vnd.ms-word.document.macroEnabled.main+xml": "document",
  [`${CT_BASE}template.main+xml`]: "document",
  "application/vnd.ms-word.template.macroEnabledTemplate.main+xml": "document",
  [`${CT_BASE}header+xml`]: "header",
  [`${CT_BASE}footer+xml`]: "footer",
  [`${CT_BASE}footnotes+xml`]: "footnotes",
  [`${CT_BASE}endnotes+xml`]: "endnotes",
  [`${CT_BASE}comments+xml`]: "comments",
};

const KIND_ORDER: ContentPartKind[] = [
  "document",
  "footnotes",
  "endnotes",
  "comments",
  "header",
  "footer",
];

export class DocxPackage {
  private constructor(
    private readonly source: Buffer,
    private readonly index: ZipIndex,
    private readonly zip: JSZip
  ) {}

  private readonly parsed = new Map<PartName, OrderedXmlNode[]>();
  private readonly dirty = new Set<PartName>();
  private contentPartsCache: ContentPartRef[] | null = null;

  static async load(buf: Buffer): Promise<DocxPackage> {
    const index = readZipIndex(buf);
    const zip = await JSZip.loadAsync(buf);
    return new DocxPackage(buf, index, zip);
  }

  /** Entry names in the archive's physical order. */
  entryNames(): PartName[] {
    return this.index.physicalOrder.map((i) => this.index.entries[i].name);
  }

  has(name: PartName): boolean {
    return this.index.entries.some((e) => e.name === name);
  }

  async text(name: PartName): Promise<string | undefined> {
    const file = this.zip.file(name);
    if (!file) return undefined;
    return file.async("string");
  }

  /** Lazily parsed preserve-order AST for an XML part. Mutate it in place. */
  async part(name: PartName): Promise<OrderedXmlNode[] | undefined> {
    const cached = this.parsed.get(name);
    if (cached) return cached;
    const xml = await this.text(name);
    if (xml === undefined) return undefined;
    const nodes = parseDocxXml(xml);
    this.parsed.set(name, nodes);
    return nodes;
  }

  markDirty(name: PartName): void {
    this.dirty.add(name);
  }

  isDirty(name: PartName): boolean {
    return this.dirty.has(name);
  }

  /**
   * Content-bearing parts, discovered from [Content_Types].xml overrides —
   * never from hardcoded file names.
   */
  async contentParts(): Promise<ContentPartRef[]> {
    if (this.contentPartsCache) return this.contentPartsCache;
    const refs = await this.readContentTypes();
    const known = new Set(refs.map((r) => r.name));
    for (const ref of await this.readDocumentRels()) {
      if (!known.has(ref.name) && this.has(ref.name)) {
        known.add(ref.name);
        refs.push(ref);
      }
    }
    refs.sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name)
    );
    this.contentPartsCache = refs;
    return refs;
  }

  private async readContentTypes(): Promise<ContentPartRef[]> {
    const nodes = await this.part("[Content_Types].xml");
    const refs: ContentPartRef[] = [];
    if (!nodes) return refs;
    const root = nodes.find((n) => "Types" in n);
    for (const child of (root?.Types as OrderedXmlNode[]) ?? []) {
      if (!("Override" in child)) continue;
      const kind = CONTENT_TYPE_KINDS[child[":@"]?.["@_ContentType"] as string];
      const partName = child[":@"]?.["@_PartName"] as string | undefined;
      if (!kind || !partName) continue;
      const name = partName.replace(/^\//, "");
      if (this.has(name)) refs.push({ name, kind });
    }
    return refs;
  }

  /** Fallback for packages whose overrides are incomplete. */
  private async readDocumentRels(): Promise<ContentPartRef[]> {
    const main = (await this.readContentTypes()).find((r) => r.kind === "document");
    if (!main) return [];
    const dir = main.name.includes("/") ? main.name.slice(0, main.name.lastIndexOf("/")) : "";
    const relsName = `${dir ? `${dir}/` : ""}_rels/${main.name.split("/").pop()}.rels`;
    const nodes = await this.part(relsName);
    const root = nodes?.find((n) => "Relationships" in n);
    const refs: ContentPartRef[] = [];
    for (const child of (root?.Relationships as OrderedXmlNode[]) ?? []) {
      if (!("Relationship" in child)) continue;
      const type = (child[":@"]?.["@_Type"] as string | undefined)?.split("/").pop();
      const target = child[":@"]?.["@_Target"] as string | undefined;
      const kind = REL_KINDS[type ?? ""];
      if (!kind || !target || /^[a-z]+:/i.test(target)) continue;
      refs.push({ name: resolveTarget(dir, target), kind });
    }
    return refs;
  }

  /** Serialises only the dirty parts; every other entry is copied verbatim. */
  async save(): Promise<Buffer> {
    const replacements = new Map<string, Buffer>();
    for (const name of this.dirty) {
      const nodes = this.parsed.get(name);
      if (!nodes) throw new Error(`pipeline-v7: part "${name}" marked dirty but never parsed`);
      replacements.set(name, Buffer.from(buildDocxXml(nodes), "utf8"));
    }
    return writeZip(this.source, this.index, replacements);
  }
}

const REL_KINDS: Record<string, ContentPartKind> = {
  header: "header",
  footer: "footer",
  footnotes: "footnotes",
  endnotes: "endnotes",
  comments: "comments",
};

function resolveTarget(dir: string, target: string): string {
  const clean = target.replace(/^\//, "");
  if (target.startsWith("/")) return clean;
  const parts = (dir ? `${dir}/${clean}` : clean).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}
