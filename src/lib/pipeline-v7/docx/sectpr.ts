/**
 * w:sectPr discovery, reading and in-place editing.
 *
 * docx-xml.ts has no child-ordering tables, so W_SECTPR_ORDER below is the
 * CT_SectPr sequence from the OOXML schema; new children are inserted at their
 * schema position and every existing child keeps its place.
 */

import { children, createNode, getAttr, setAttr, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { ColsInfo, HeaderFooterRef, PgMar, PgSz, SectPrRef } from "../types";

export const W_SECTPR_ORDER = [
  "w:headerReference",
  "w:footerReference",
  "w:footnotePr",
  "w:endnotePr",
  "w:type",
  "w:pgSz",
  "w:pgMar",
  "w:paperSrc",
  "w:pgBorders",
  "w:lnNumType",
  "w:pgNumType",
  "w:cols",
  "w:formProt",
  "w:vAlign",
  "w:noEndnote",
  "w:titlePg",
  "w:textDirection",
  "w:bidi",
  "w:rtlGutter",
  "w:docGrid",
  "w:printerSettings",
  "w:sectPrChange",
] as const;

function isOn(value: string | undefined): boolean {
  return value === undefined || !(value === "0" || value === "false" || value === "off");
}

function collect(
  node: OrderedXmlNode,
  parentTag: string,
  path: string,
  out: SectPrRef[],
  currentP: OrderedXmlNode | undefined
): void {
  const counters = new Map<string, number>();
  for (const child of children(node)) {
    const tag = tagName(child);
    if (!tag) continue;
    const idx = counters.get(tag) ?? 0;
    counters.set(tag, idx + 1);
    const childPath = path ? `${path}/${tag}[${idx}]` : `${tag}[${idx}]`;
    if (tag === "w:sectPr") {
      // A w:sectPr inside w:sectPrChange is a revision snapshot, not live layout.
      if (parentTag !== "w:sectPrChange") {
        const scope = parentTag === "w:pPr" ? "pPr" : "body";
        out.push({ node: child, scope, path: childPath, paragraph: scope === "pPr" ? currentP : undefined });
      }
      continue;
    }
    collect(child, tag, childPath, out, tag === "w:p" ? child : currentP);
  }
}

/**
 * Every live w:sectPr in a part: the body-level one (last, if present) and each
 * w:pPr/w:sectPr — including those inside table cells, sdt and text boxes.
 */
export function enumerateSectPr(part: OrderedXmlNode[] | OrderedXmlNode): SectPrRef[] {
  const roots = Array.isArray(part) ? part : [part];
  const out: SectPrRef[] = [];
  collect({ "#root": roots } as OrderedXmlNode, "#root", "", out, undefined);
  return out;
}

function child(sectPr: OrderedXmlNode, tag: string): OrderedXmlNode | undefined {
  return children(sectPr).find((c) => tag in c);
}

/** Finds or creates a child at its CT_SectPr schema position. */
export function ensureSectPrChild(sectPr: OrderedXmlNode, tag: string): OrderedXmlNode {
  const existing = child(sectPr, tag);
  if (existing) return existing;
  const node = createNode(tag);
  const rank = W_SECTPR_ORDER.indexOf(tag as (typeof W_SECTPR_ORDER)[number]);
  const ch = children(sectPr);
  const at = ch.findIndex((c) => {
    const t = tagName(c);
    const r = t ? W_SECTPR_ORDER.indexOf(t as (typeof W_SECTPR_ORDER)[number]) : -1;
    return r >= 0 && rank >= 0 && r > rank;
  });
  if (at >= 0) ch.splice(at, 0, node);
  else ch.push(node);
  return node;
}

export function getPgSz(sectPr: OrderedXmlNode): PgSz | undefined {
  const node = child(sectPr, "w:pgSz");
  if (!node) return undefined;
  return {
    w: getAttr(node, "w:w"),
    h: getAttr(node, "w:h"),
    orient: getAttr(node, "w:orient"),
    code: getAttr(node, "w:code"),
  };
}

export function getPgMar(sectPr: OrderedXmlNode): PgMar | undefined {
  const node = child(sectPr, "w:pgMar");
  if (!node) return undefined;
  const keys: (keyof PgMar)[] = ["top", "right", "bottom", "left", "header", "footer", "gutter"];
  const out: PgMar = {};
  for (const k of keys) out[k] = getAttr(node, `w:${k}`);
  return out;
}

/** w:orient, defaulting to the OOXML default of "portrait". */
export function getOrient(sectPr: OrderedXmlNode): "portrait" | "landscape" {
  return getPgSz(sectPr)?.orient === "landscape" ? "landscape" : "portrait";
}

export function getCols(sectPr: OrderedXmlNode): ColsInfo {
  const node = child(sectPr, "w:cols");
  if (!node) return { num: 1, equalWidth: true };
  const attr = getAttr(node, "w:equalWidth");
  const explicit = children(node).some((c) => "w:col" in c);
  return {
    num: Number(getAttr(node, "w:num") ?? (explicit ? children(node).length : 1)) || 1,
    equalWidth: attr === undefined ? !explicit : isOn(attr),
    space: getAttr(node, "w:space"),
  };
}

/** w:type, defaulting to the OOXML default of "nextPage". */
export function getType(sectPr: OrderedXmlNode): string {
  const node = child(sectPr, "w:type");
  return (node && getAttr(node, "w:val")) || "nextPage";
}

export function getHeaderFooterRefs(sectPr: OrderedXmlNode): HeaderFooterRef[] {
  const out: HeaderFooterRef[] = [];
  for (const c of children(sectPr)) {
    const tag = tagName(c);
    if (tag !== "w:headerReference" && tag !== "w:footerReference") continue;
    const relId = getAttr(c, "r:id");
    if (!relId) continue;
    out.push({
      kind: tag === "w:headerReference" ? "header" : "footer",
      type: getAttr(c, "w:type") ?? "default",
      relId,
    });
  }
  return out;
}

export function hasTitlePg(sectPr: OrderedXmlNode): boolean {
  const node = child(sectPr, "w:titlePg");
  return node !== undefined && isOn(getAttr(node, "w:val"));
}

/** Merges the given margins into w:pgMar, leaving other attributes untouched. */
export function setPgMar(sectPr: OrderedXmlNode, values: PgMar): void {
  const node = ensureSectPrChild(sectPr, "w:pgMar");
  for (const [key, val] of Object.entries(values)) {
    if (val !== undefined) setAttr(node, `w:${key}`, String(val));
  }
}

export function setPgSz(sectPr: OrderedXmlNode, w: string | number, h: string | number, orient?: string): void {
  const node = ensureSectPrChild(sectPr, "w:pgSz");
  setAttr(node, "w:w", String(w));
  setAttr(node, "w:h", String(h));
  if (orient !== undefined) setAttr(node, "w:orient", orient);
}
