/**
 * Style cascade resolver over word/styles.xml.
 *
 * A heading is rarely marked as one directly: Word documents inherit
 * w:outlineLvl through w:basedOn chains, LibreOffice writes "Heading_20_1",
 * Google Docs writes "Heading 1", and Russian templates write "Заголовок 1".
 * Normalising the name and walking the chain catches all four without a
 * hardcoded per-editor table.
 */

import { children, findChild, getAttr, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { DocxPackage } from "../docx/package";

export interface StyleInfo {
  id: string;
  name?: string;
  nameNorm?: string;
  idNorm: string;
  basedOn?: string;
  /** w:pPr/w:outlineLvl value, 0-based as stored in the file. */
  outlineLvl?: number;
  numPr?: { numId?: string; ilvl?: number };
  /** Heading level implied by this style alone, without following basedOn. */
  isHeadingLevel?: number;
}

export interface StyleIndex {
  byId: Map<string, StyleInfo>;
  defaultParagraphStyleId?: string;
  hasDocDefaults: boolean;
  resolveHeadingLevel(styleId: string | undefined): number | undefined;
  isTocStyle(styleId: string | undefined): boolean;
  isCaptionStyle(styleId: string | undefined): boolean;
}

const MAX_DEPTH = 10;
const TOC_RE = /^(toc|оглавление)[1-9]$/;
const CAPTION_NAMES = new Set(["caption", "название объекта", "названиеобъекта"]);
const HEADING_RE = /^(heading|заголовок)([1-9])$/;
const FIXED_LEVELS: Record<string, number> = {
  title: 1,
  название: 1,
  subtitle: 2,
  подзаголовок: 2,
};

/** lowercase + NFC + "_20_"→space + collapse spaces + glue "заголовок 1"→"заголовок1". */
export function normStyleName(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/_20_/g, " ")
    .replace(/[\s ]+/g, " ")
    .trim()
    .replace(/(\p{L})\s+(\d)/gu, "$1$2");
}

function ownHeadingLevel(info: StyleInfo): number | undefined {
  if (info.outlineLvl !== undefined) return Math.min(info.outlineLvl + 1, 9);
  for (const key of [info.idNorm, info.nameNorm ?? ""]) {
    const m = HEADING_RE.exec(key);
    if (m) return Number(m[2]);
    if (key in FIXED_LEVELS) return FIXED_LEVELS[key];
  }
  return undefined;
}

function readNumPr(pPr: OrderedXmlNode | undefined): StyleInfo["numPr"] {
  const numPr = pPr ? findChild(pPr, "w:numPr") : undefined;
  if (!numPr) return undefined;
  const numId = findChild(numPr, "w:numId");
  const ilvl = findChild(numPr, "w:ilvl");
  const lvlVal = ilvl ? getAttr(ilvl, "w:val") : undefined;
  return {
    numId: numId ? getAttr(numId, "w:val") : undefined,
    ilvl: lvlVal === undefined ? undefined : Number(lvlVal),
  };
}

function readStyle(node: OrderedXmlNode): StyleInfo | undefined {
  const id = getAttr(node, "w:styleId");
  if (!id) return undefined;
  const nameNode = findChild(node, "w:name");
  const name = nameNode ? getAttr(nameNode, "w:val") : undefined;
  const basedOnNode = findChild(node, "w:basedOn");
  const pPr = findChild(node, "w:pPr");
  const outlineNode = pPr ? findChild(pPr, "w:outlineLvl") : undefined;
  const outlineRaw = outlineNode ? getAttr(outlineNode, "w:val") : undefined;
  const info: StyleInfo = {
    id,
    name,
    nameNorm: normStyleName(name),
    idNorm: normStyleName(id),
    basedOn: basedOnNode ? getAttr(basedOnNode, "w:val") : undefined,
    outlineLvl: outlineRaw === undefined || outlineRaw === "" ? undefined : Number(outlineRaw),
    numPr: readNumPr(pPr),
  };
  info.isHeadingLevel = ownHeadingLevel(info);
  return info;
}

function matches(info: StyleInfo | undefined, test: (key: string) => boolean): boolean {
  if (!info) return false;
  return test(info.idNorm) || test(info.nameNorm ?? "");
}

export async function buildStyleIndex(pkg: DocxPackage): Promise<StyleIndex> {
  const byId = new Map<string, StyleInfo>();
  let defaultParagraphStyleId: string | undefined;
  let hasDocDefaults = false;
  const nodes = (await pkg.part("word/styles.xml")) ?? [];
  const root = nodes.find((n) => "w:styles" in n);
  for (const child of root ? children(root) : []) {
    const tag = tagName(child);
    if (tag === "w:docDefaults") hasDocDefaults = true;
    if (tag !== "w:style") continue;
    const info = readStyle(child);
    if (!info) continue;
    byId.set(info.id, info);
    const isParagraph = (getAttr(child, "w:type") ?? "paragraph") === "paragraph";
    if (isParagraph && getAttr(child, "w:default") === "1" && !defaultParagraphStyleId) {
      defaultParagraphStyleId = info.id;
    }
  }
  return {
    byId,
    defaultParagraphStyleId,
    hasDocDefaults,
    resolveHeadingLevel: (styleId) => resolveHeadingLevel(byId, styleId),
    isTocStyle: (styleId) => matches(byId.get(styleId ?? ""), (k) => TOC_RE.test(k)),
    isCaptionStyle: (styleId) => matches(byId.get(styleId ?? ""), (k) => CAPTION_NAMES.has(k)),
  };
}

/** Follows w:basedOn until a style declares an outline level or a heading name. */
export function resolveHeadingLevel(
  byId: Map<string, StyleInfo>,
  styleId: string | undefined
): number | undefined {
  let current = styleId;
  const seen = new Set<string>();
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    const info = byId.get(current);
    if (!info) {
      // Style not declared in styles.xml: its id alone may still name a heading.
      return ownHeadingLevel({ id: current, idNorm: normStyleName(current) });
    }
    if (info.isHeadingLevel !== undefined) return info.isHeadingLevel;
    current = info.basedOn;
  }
  return undefined;
}
