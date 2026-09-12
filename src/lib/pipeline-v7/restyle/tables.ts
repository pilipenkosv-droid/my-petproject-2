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

import { children, createNode, findChildren, getAttr, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { RulePack } from "@/lib/pipeline-v6/rule-packs/types";
import { walkBlocks } from "../docx/walk";
import { gridColSumTwips } from "../fingerprint/blocks";
import { enumerateSectPr, getPgMar, getPgSz } from "../docx/sectpr";
import type { DocxPackage } from "../docx/package";
import type { ClassificationResult } from "../classify/types";
import { W_TBLPR_ORDER, W_TRPR_ORDER, setPropInOrder } from "./ooxml-order";

/** Text width of an A4 page with ГОСТ margins — the fallback when none is readable. */
const DEFAULT_TEXT_WIDTH_TW = 9638;

/**
 * Share of the text width below which a grid is deliberately narrow. A table
 * drawn at 40 % of the column is a small inset, and stretching it to 100 %
 * would be a layout decision, not a formatting fix.
 */
const NARROW_GRID_SHARE = 0.6;

/**
 * Text width of the first section of the main document part, twips.
 *
 * "First section" is a simplification: a document whose sections differ in
 * width would need the enclosing section per table, and the only thing this
 * number decides is whether a table is narrow on purpose.
 */
export async function firstSectionTextWidth(pkg: DocxPackage): Promise<number> {
  const ref = (await pkg.contentParts()).find((r) => r.kind === "document");
  const nodes = ref ? await pkg.part(ref.name) : undefined;
  const sectPr = nodes ? enumerateSectPr(nodes)[0]?.node : undefined;
  if (!sectPr) return DEFAULT_TEXT_WIDTH_TW;
  const size = getPgSz(sectPr);
  const mar = getPgMar(sectPr);
  const w = Number(size?.w);
  const left = Number(mar?.left ?? 0);
  const right = Number(mar?.right ?? 0);
  const width = w - (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
  return Number.isFinite(width) && width > 0 ? width : DEFAULT_TEXT_WIDTH_TW;
}

/** True when any cell of this table states its width in absolute units. */
function hasAbsoluteCellWidth(tbl: OrderedXmlNode): boolean {
  const visit = (node: OrderedXmlNode): boolean => {
    for (const child of children(node)) {
      const tag = tagName(child);
      if (!tag) continue;
      // A nested table owns its own cells; its widths say nothing about this one.
      if (tag === "w:tbl") continue;
      if (tag === "w:tcW" && getAttr(child, "w:type") === "dxa") return true;
      if (visit(child)) return true;
    }
    return false;
  };
  return visit(tbl);
}

/**
 * True when the table states its own geometry and must keep it: either some
 * cell is measured in absolute units, or the grid is deliberately narrower than
 * the text column. Stretching such a table to 100 % breaks the layout it was
 * drawn with.
 */
export function ownsItsWidth(tbl: OrderedXmlNode, textWidthTw: number): boolean {
  if (hasAbsoluteCellWidth(tbl)) return true;
  const sum = gridColSumTwips(tbl);
  return sum > 0 && sum < NARROW_GRID_SHARE * textWidthTw;
}

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

/** w:trPr, created at its schema position (after w:tblPrEx, before the cells). */
function trPrOf(tr: OrderedXmlNode): OrderedXmlNode {
  const ch = children(tr);
  const existing = ch.find((c) => "w:trPr" in c);
  if (existing) return existing;
  const node = createNode("w:trPr");
  const at = ch.findIndex((c) => tagName(c) !== "w:tblPrEx");
  ch.splice(at < 0 ? ch.length : at, 0, node);
  return node;
}

/** A first row that continues a vertical merge is not a header row. */
function continuesVMerge(tr: OrderedXmlNode): boolean {
  return findChildren(tr, "w:tc").some((tc) => {
    const tcPr = children(tc).find((c) => "w:tcPr" in c);
    const merge = tcPr ? children(tcPr).find((c) => "w:vMerge" in c) : undefined;
    return merge !== undefined && getAttr(merge, "w:val") !== "restart";
  });
}

/**
 * w:tblHeader on the first row, so a table that breaks across pages repeats its
 * head. Single-row tables are skipped — they cannot break — and so is a first
 * row that is the continuation of a vertical merge.
 */
export function setHeaderRow(tbl: OrderedXmlNode): boolean {
  const rows = findChildren(tbl, "w:tr");
  if (rows.length <= 1) return false;
  if (continuesVMerge(rows[0])) return false;
  const trPr = trPrOf(rows[0]);
  if (children(trPr).some((c) => "w:tblHeader" in c)) return false;
  setPropInOrder(trPr, "w:tblHeader", {}, W_TRPR_ORDER);
  return true;
}

export function restyleTable(tbl: OrderedXmlNode, textWidthTw = DEFAULT_TEXT_WIDTH_TW): boolean {
  const tblPr = tblPrOf(tbl);
  const kids = children(tblPr);
  const tblW = kids.find((c) => "w:tblW" in c);
  const type = tblW ? getAttr(tblW, "w:type") : undefined;
  const unstated = !tblW || type === undefined || type === "auto" || type === "nil";
  if (unstated && !ownsItsWidth(tbl, textWidthTw)) {
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
export interface TableStats {
  tables: number;
  /** First rows that gained a w:tblHeader. */
  headerRows: number;
}

export async function restyleTables(
  pkg: DocxPackage,
  _pack: RulePack,
  _classification?: ClassificationResult
): Promise<TableStats> {
  const out: TableStats = { tables: 0, headerRows: 0 };
  const textWidth = await firstSectionTextWidth(pkg);
  for (const ref of await pkg.contentParts()) {
    const nodes = await pkg.part(ref.name);
    if (!nodes) continue;
    let partTouched = 0;
    for (const block of walkBlocks(nodes)) {
      if (block.kind !== "tbl") continue;
      if (restyleTable(block.node, textWidth)) partTouched += 1;
      // Only top-level tables are checked for header repeat; a nested table
      // never breaks across pages on its own.
      if (block.inTableDepth === 0 && setHeaderRow(block.node)) out.headerRows += 1;
    }
    if (partTouched > 0) pkg.markDirty(ref.name);
    out.tables += partTouched;
  }
  return out;
}
