/**
 * Shared plumbing for the aux inserters: finding the main document body, the
 * title-page region inside it, and minting unique `_dpx_aux_<kind>_<n>`
 * bookmark ranges.
 *
 * Every block an inserter adds MUST sit inside such a range: the fidelity gate
 * strips aux-marked blocks out of the "after" fingerprint (A1) and turns their
 * own markers into the insertion budget. An unmarked insertion is a violation.
 */

import {
  children,
  createNode,
  getAttr,
  getBody,
  type OrderedXmlNode,
} from "@/lib/xml/docx-xml";
import { walkAll } from "../fingerprint/scan";
import type { DocxPackage } from "../docx/package";
import type { ClassificationResult } from "../classify/types";

/** Role by node identity, taken from the list (byNode is keyed on the original). */
export function roleMap(classification: ClassificationResult): Map<OrderedXmlNode, string> {
  const out = new Map<OrderedXmlNode, string>();
  for (const cp of classification.list) out.set(cp.node, cp.role);
  return out;
}

export interface MainPart {
  name: string;
  nodes: OrderedXmlNode[];
  body: OrderedXmlNode;
  /** Direct children of w:body — mutate this array to insert. */
  blocks: OrderedXmlNode[];
}

/** The main document part with its body, or undefined if the package has none. */
export async function mainPart(pkg: DocxPackage): Promise<MainPart | undefined> {
  const ref = (await pkg.contentParts()).find((r) => r.kind === "document");
  if (!ref) return undefined;
  const nodes = await pkg.part(ref.name);
  const body = nodes ? getBody(nodes) : undefined;
  if (!nodes || !body) return undefined;
  return { name: ref.name, nodes, body, blocks: children(body) };
}

/** Directory of a part name, "" for a part at the archive root. */
export function dirOf(name: string): string {
  return name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
}

/**
 * Index in `blocks` of the last top-level paragraph classified `title_page`,
 * or -1. Only direct body children count: a title page inside a table or an
 * sdt is not a region anything may be appended after.
 */
export function lastTitlePageIndex(part: MainPart, roles: Map<OrderedXmlNode, string>): number {
  let last = -1;
  for (let i = 0; i < part.blocks.length; i++) {
    const node = part.blocks[i];
    if (!("w:p" in node)) continue;
    if (roles.get(node) === "title_page") last = i;
  }
  return last;
}

/** Index of the first paragraph or table among the body's children. */
export function firstBlockIndex(part: MainPart): number {
  const at = part.blocks.findIndex((n) => "w:p" in n || "w:tbl" in n);
  return at < 0 ? 0 : at;
}

/** Smallest w:id not used by any bookmark in the part. */
export function nextBookmarkId(nodes: OrderedXmlNode[]): number {
  let max = 0;
  walkAll(nodes, (node, tag) => {
    if (tag !== "w:bookmarkStart" && tag !== "w:bookmarkEnd") return;
    const id = Number(getAttr(node, "w:id"));
    if (Number.isFinite(id) && id > max) max = id;
  });
  return max + 1;
}

/**
 * Wraps a freshly built paragraph in its own aux bookmark range, in place.
 * Start and end live inside the same w:p, so the gate sees exactly this block
 * covered — nothing before it and nothing after.
 */
export function markAux(p: OrderedXmlNode, kind: "toc" | "caption", n: number, id: number): void {
  const ch = children(p);
  const at = ch.findIndex((c) => !("w:pPr" in c));
  const start = createNode("w:bookmarkStart", { "w:id": String(id), "w:name": `_dpx_aux_${kind}_${n}` });
  ch.splice(at < 0 ? ch.length : at, 0, start);
  ch.push(createNode("w:bookmarkEnd", { "w:id": String(id) }));
}
