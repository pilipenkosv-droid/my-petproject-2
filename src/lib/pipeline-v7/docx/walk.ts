/**
 * Document-order traversal of block-level OOXML content.
 *
 * walkBlocks descends through every container that can hold a w:p or w:tbl —
 * tables, sdt, text boxes, revision marks, smart tags — so a restyler sees
 * every block exactly once, wherever it is buried.
 */

import { children, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { BlockRef } from "../types";

/**
 * Run-level containers paragraphText descends into.
 *
 * getRuns() from docx-xml.ts is not reused here: it returns direct runs first
 * and wrapped runs after, which loses reading order, and it knows nothing about
 * w:smartTag / w:fldSimple / w:customXml.
 */
const TEXT_CONTAINERS = new Set([
  "w:r",
  "w:hyperlink",
  "w:ins",
  "w:smartTag",
  "w:fldSimple",
  "w:customXml",
]);

const RUN_CHARS: Record<string, string> = {
  "w:tab": "\t",
  "w:br": "\n",
  "w:cr": "\n",
  "w:noBreakHyphen": "‑",
  "w:sym": "",
};

function* walkNode(
  node: OrderedXmlNode,
  depth: number,
  path: string,
  inTableDepth: number
): Generator<BlockRef> {
  const counters = new Map<string, number>();
  for (const child of children(node)) {
    const tag = tagName(child);
    if (!tag) continue; // #text / #comment / #cdata
    const idx = counters.get(tag) ?? 0;
    counters.set(tag, idx + 1);
    const childPath = path ? `${path}/${tag}[${idx}]` : `${tag}[${idx}]`;
    const isTbl = tag === "w:tbl";
    if (isTbl || tag === "w:p") {
      yield {
        kind: isTbl ? "tbl" : "p",
        node: child,
        parent: node,
        depth: depth + 1,
        inTableDepth,
        path: childPath,
      };
    }
    yield* walkNode(child, depth + 1, childPath, inTableDepth + (isTbl ? 1 : 0));
  }
}

/**
 * Yields every w:p and w:tbl in document order.
 *
 * Descent is universal, so mc:AlternateContent yields the blocks of both
 * mc:Choice and mc:Fallback — distinct nodes that a restyler must keep in sync.
 * Each node is visited once; `path` identifies it uniquely.
 */
export function* walkBlocks(part: OrderedXmlNode[] | OrderedXmlNode): Generator<BlockRef> {
  const roots = Array.isArray(part) ? part : [part];
  yield* walkNode({ "#root": roots } as OrderedXmlNode, -1, "", 0);
}

function nodeText(node: OrderedXmlNode): string {
  let out = "";
  for (const child of children(node)) {
    if ("#text" in child) out += String(child["#text"]);
  }
  return out;
}

function collectText(node: OrderedXmlNode, out: string[]): void {
  for (const child of children(node)) {
    const tag = tagName(child);
    if (!tag) continue;
    if (tag === "w:t") {
      out.push(nodeText(child));
    } else if (tag in RUN_CHARS) {
      out.push(RUN_CHARS[tag]);
    } else if (TEXT_CONTAINERS.has(tag)) {
      collectText(child, out);
    }
    // Everything else (w:del, w:drawing, w:pict, w:txbxContent, w:pPr) is skipped:
    // deleted text is not content, and text boxes are separate blocks.
  }
}

/** Visible text of a paragraph, excluding deletions and nested text boxes. */
export function paragraphText(pNode: OrderedXmlNode): string {
  const out: string[] = [];
  collectText(pNode, out);
  return out.join("");
}
