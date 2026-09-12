/**
 * Table geometry — the most dangerous thing in the package to rewrite, so the
 * restyler barely does.
 *
 * A table's real layout lives in w:tblGrid, w:tcW, w:gridSpan and w:vMerge, and
 * any of those set wrong turns a merged-cell table into a diagonal mess. None
 * of them are touched. Only two things change, and only when the document left
 * them unstated: a table with no explicit width gets 100%, and a table with no
 * alignment gets centred.
 */

import { children, createNode, getAttr, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { RulePack } from "@/lib/pipeline-v6/rule-packs/types";
import { walkBlocks } from "../docx/walk";
import type { DocxPackage } from "../docx/package";
import type { ClassificationResult } from "../classify/types";
import { W_TBLPR_ORDER, setPropInOrder } from "./ooxml-order";

function tblPrOf(tbl: OrderedXmlNode): OrderedXmlNode {
  const ch = children(tbl);
  const existing = ch.find((c) => "w:tblPr" in c);
  if (existing) return existing;
  // w:tblPr must be the first child of w:tbl; inserting it anywhere else would
  // make the table invalid, so it is created only at position 0.
  const node = createNode("w:tblPr");
  ch.unshift(node);
  return node;
}

export function restyleTable(tbl: OrderedXmlNode): boolean {
  const tblPr = tblPrOf(tbl);
  const kids = children(tblPr);
  const tblW = kids.find((c) => "w:tblW" in c);
  const type = tblW ? getAttr(tblW, "w:type") : undefined;
  if (!tblW || type === undefined || type === "auto" || type === "nil") {
    setPropInOrder(tblPr, "w:tblW", { "w:w": "5000", "w:type": "pct" }, W_TBLPR_ORDER);
  }
  if (!kids.some((c) => "w:jc" in c)) {
    setPropInOrder(tblPr, "w:jc", { "w:val": "center" }, W_TBLPR_ORDER);
  }
  return true;
}

/**
 * Walks every table of every content part, nested ones included. Cell
 * paragraphs are not handled here — they arrive through the classifier with
 * role `table_cell` like any other paragraph.
 */
export async function restyleTables(
  pkg: DocxPackage,
  _pack: RulePack,
  _classification?: ClassificationResult
): Promise<number> {
  let count = 0;
  for (const ref of await pkg.contentParts()) {
    const nodes = await pkg.part(ref.name);
    if (!nodes) continue;
    let partTouched = 0;
    for (const block of walkBlocks(nodes)) {
      if (block.kind !== "tbl") continue;
      if (restyleTable(block.node)) partTouched += 1;
    }
    if (partTouched > 0) pkg.markDirty(ref.name);
    count += partTouched;
  }
  return count;
}
