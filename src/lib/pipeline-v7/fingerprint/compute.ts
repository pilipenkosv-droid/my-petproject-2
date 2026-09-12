/**
 * computeFingerprint — always from bytes, never from a live AST.
 *
 * The restyler mutates an AST in place; a fingerprint taken from that AST would
 * share objects with it and could not prove what was actually written. So the
 * buffer is re-opened into a fresh DocxPackage every time.
 */

import { findChild, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { DocxPackage } from "../docx/package";
import { readZipIndex } from "../docx/zip";
import {
  enumerateSectPr,
  getCols,
  getHeaderFooterRefs,
  getOrient,
  getType,
  hasTitlePg,
} from "../docx/sectpr";
import { buildBlocks } from "./blocks";
import { scanPart } from "./scan";
import type { Fingerprint, PackagePrint, PartPrint, SectionPrint, TableShape } from "./types";

const MEDIA = /(^|\/)media\//;
const EMBEDDINGS = /(^|\/)embeddings\//;

function sectionPrint(sectPr: OrderedXmlNode): SectionPrint {
  const cols = getCols(sectPr);
  const refs = getHeaderFooterRefs(sectPr);
  return {
    orient: getOrient(sectPr),
    colsNum: cols.num,
    colsEqualWidth: cols.equalWidth,
    type: findChild(sectPr, "w:type") ? getType(sectPr) : null,
    headerRefTypes: refs.filter((r) => r.kind === "header").map((r) => r.type),
    footerRefTypes: refs.filter((r) => r.kind === "footer").map((r) => r.type),
    titlePg: hasTitlePg(sectPr),
  };
}

function printPart(nodes: OrderedXmlNode[]): PartPrint {
  const blocks = buildBlocks(nodes);
  const { counts, fieldInstrs, bookmarks } = scanPart(nodes);
  const tableShapes: TableShape[] = blocks
    .filter((b): b is Extract<typeof b, { kind: "tbl" }> => b.kind === "tbl")
    .map((b) => b.shape);
  return {
    blocks,
    counts,
    tableShapes,
    fieldInstrs,
    bookmarks,
    sections: enumerateSectPr(nodes).map((ref) => sectionPrint(ref.node)),
  };
}

async function packagePrint(buf: Buffer, pkg: DocxPackage): Promise<PackagePrint> {
  const { entries } = readZipIndex(buf);
  const mediaFiles: string[] = [];
  const relTargets: string[] = [];
  let embeddedObjects = 0;

  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue; // directory entry, not a file
    if (MEDIA.test(entry.name)) mediaFiles.push(`${entry.name}:${entry.uncompressedSize}`);
    if (EMBEDDINGS.test(entry.name)) embeddedObjects += 1;
    if (!entry.name.endsWith(".rels")) continue;
    const nodes = await pkg.part(entry.name);
    const root = nodes?.find((n) => "Relationships" in n);
    for (const child of (root?.Relationships as OrderedXmlNode[]) ?? []) {
      const target = child[":@"]?.["@_Target"] as string | undefined;
      if (target) relTargets.push(`${entry.name}|${target}`);
    }
  }
  return { mediaFiles: mediaFiles.sort(), relTargets: relTargets.sort(), embeddedObjects };
}

export async function computeFingerprint(buf: Buffer): Promise<Fingerprint> {
  const pkg = await DocxPackage.load(buf);
  const parts: Record<string, PartPrint> = {};
  for (const ref of await pkg.contentParts()) {
    const nodes = await pkg.part(ref.name);
    if (nodes) parts[ref.name] = printPart(nodes);
  }
  return { version: 1, parts, packageLevel: await packagePrint(buf, pkg) };
}
