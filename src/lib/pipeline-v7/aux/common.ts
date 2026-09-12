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
  findChild,
  getAttr,
  getBody,
  tagName,
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

/** How far into the body the page-break fallback is willing to look. */
const BREAK_SCAN_LIMIT = 60;

/**
 * Where the page break of a paragraph sits relative to its own content:
 * "before" starts a page in front of it, "inside" ends one after it.
 */
function pageBreakKind(node: OrderedXmlNode): "before" | "inside" | null {
  if (!("w:p" in node)) return null;
  const pPr = findChild(node, "w:pPr");
  const props = pPr ? children(pPr) : [];
  if (props.some((c) => "w:sectPr" in c)) return "inside";
  if (props.some((c) => "w:pageBreakBefore" in c)) return "before";
  let found = false;
  walkAll(node, (n, tag) => {
    if (tag === "w:br" && getAttr(n, "w:type") === "page") found = true;
  });
  return found ? "inside" : null;
}

/** Last block still on the title page, given the block that carries the break. */
function endBefore(index: number, kind: "before" | "inside"): number {
  return kind === "before" ? index - 1 : index;
}

/** Reason the title region could not be located. */
export type TitleRegionMiss = "no-title-page";

/**
 * Index of the last block of the title region — insert after it.
 *
 * The classifier's `title_page` verdict comes first. When it found none, the
 * title page is usually a layout the paragraph heuristics do not recognise: a
 * single table filling the sheet, or plain paragraphs ended by a hard page
 * break. Both are looked for in that order, and if neither is there the region
 * is unknown and nothing may be inserted — putting a table of contents at
 * block 0 would print it above the student's own title.
 */
export function titleRegionEnd(
  part: MainPart,
  roles: Map<OrderedXmlNode, string>
): number | TitleRegionMiss {
  const byRole = lastTitlePageIndex(part, roles);
  if (byRole >= 0) return byRole;

  for (let i = 0; i < part.blocks.length; i++) {
    if (tagName(part.blocks[i]) !== "w:tbl") continue;
    const next = part.blocks.slice(i + 1).findIndex((n) => "w:p" in n || "w:tbl" in n);
    if (next < 0) break;
    const at = i + 1 + next;
    const kind = pageBreakKind(part.blocks[at]);
    if (kind) return Math.max(endBefore(at, kind), i);
    break;
  }

  const limit = Math.min(part.blocks.length, BREAK_SCAN_LIMIT);
  for (let i = 0; i < limit; i++) {
    const kind = pageBreakKind(part.blocks[i]);
    if (!kind) continue;
    const end = endBefore(i, kind);
    return end >= 0 ? end : "no-title-page";
  }
  return "no-title-page";
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
