/**
 * Marker counting, field-instruction and bookmark collection.
 *
 * Everything here walks the parsed AST — never a regex over the XML — so
 * content buried in tables, text boxes, sdt or revision marks is counted too.
 */

import { children, getAttr, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { MARKERS, emptyCounts, type Marker, type MarkerCounts } from "./types";
import { normalizeInstr } from "./normalize";

const PLAIN_MARKERS = new Set<string>(MARKERS.filter((m) => !m.includes("[")));

/** The marker a single element contributes, if any. */
export function markerOf(node: OrderedXmlNode, tag: string): Marker | undefined {
  if (tag === "w:fldChar") return getAttr(node, "w:fldCharType") === "begin" ? "w:fldChar[begin]" : undefined;
  if (tag === "w:br") return getAttr(node, "w:type") === "page" ? "w:br[page]" : undefined;
  return PLAIN_MARKERS.has(tag) ? (tag as Marker) : undefined;
}

export type Visit = (node: OrderedXmlNode, tag: string) => void;

/** Depth-first document-order walk over every element of a subtree. */
export function walkAll(nodes: OrderedXmlNode[] | OrderedXmlNode, visit: Visit): void {
  const roots = Array.isArray(nodes) ? nodes : [nodes];
  for (const node of roots) {
    const tag = tagName(node);
    if (!tag) continue;
    visit(node, tag);
    walkAll(children(node), visit);
  }
}

/**
 * Walk a block's own content: the node itself plus everything down to, but not
 * into, a nested w:p or w:tbl. Summing this over all blocks never double counts.
 */
export function walkOwn(node: OrderedXmlNode, visit: Visit): void {
  const tag = tagName(node);
  if (!tag) return;
  visit(node, tag);
  for (const child of children(node)) {
    const childTag = tagName(child);
    if (!childTag || childTag === "w:p" || childTag === "w:tbl") continue;
    walkOwn(child, visit);
  }
}

export function ownMarkers(node: OrderedXmlNode): Partial<Record<Marker, number>> {
  const out: Partial<Record<Marker, number>> = {};
  walkOwn(node, (n, tag) => {
    const marker = markerOf(n, tag);
    if (marker) out[marker] = (out[marker] ?? 0) + 1;
  });
  return out;
}

export function elementText(node: OrderedXmlNode): string {
  let out = "";
  for (const child of children(node)) if ("#text" in child) out += String(child["#text"]);
  return out;
}

export interface PartScan {
  counts: MarkerCounts;
  fieldInstrs: string[];
  bookmarks: string[];
}

/**
 * One pass over a part: marker counts, field instructions (consecutive
 * w:instrText runs of one field concatenated) and bookmark names.
 */
export function scanPart(nodes: OrderedXmlNode[]): PartScan {
  const counts = emptyCounts();
  const fieldInstrs: string[] = [];
  const bookmarks: string[] = [];
  let buffer = "";

  const flush = () => {
    const instr = normalizeInstr(buffer);
    if (instr) fieldInstrs.push(instr);
    buffer = "";
  };

  walkAll(nodes, (node, tag) => {
    const marker = markerOf(node, tag);
    if (marker) counts[marker] += 1;
    if (tag === "w:instrText") {
      buffer += elementText(node);
      return;
    }
    if (tag === "w:fldChar") {
      flush();
      return;
    }
    if (tag === "w:fldSimple") {
      const instr = normalizeInstr(getAttr(node, "w:instr") ?? "");
      if (instr) fieldInstrs.push(instr);
      return;
    }
    if (tag === "w:bookmarkStart") {
      const name = getAttr(node, "w:name");
      if (name) bookmarks.push(name);
    }
  });
  flush();

  return { counts, fieldInstrs: fieldInstrs.sort(), bookmarks: bookmarks.sort() };
}
