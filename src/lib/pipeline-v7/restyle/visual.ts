/**
 * One description of "what a role looks like", shared by the style writer and
 * the direct-formatting writer.
 *
 * The checker reads w:pPr directly rather than resolving the style cascade, so
 * every visual has to be written twice: once into a canonical style and once as
 * direct formatting on the paragraph. Deriving both from the same VisualSpec is
 * what keeps them from drifting apart.
 */

import type { OrderedXmlNode } from "@/lib/xml/docx-xml";
import { W_PPR_ORDER, W_RPR_ORDER, removeChildren, setPropInOrder } from "./ooxml-order";
import {
  BODY_ALIGN,
  headingLevelOf,
  mmToTwips,
  ptToHalfPt,
  ptToTwips,
  type PackSpec,
} from "./spec";
import type { Role } from "../classify/types";

export interface VisualSpec {
  /** Line spacing in 240ths, always with lineRule="auto". */
  line: number;
  beforeTw: number;
  afterTw: number;
  /** First-line indent, twips. Ignored when `hangingTw` is set. */
  firstLineTw: number;
  hangingTw?: number;
  /** Suppress w:ind entirely — numbering owns the indents of a list item. */
  noInd?: boolean;
  jc: string;
  /** Run size, half-points. */
  sz: number;
  bold?: boolean;
  italic?: boolean;
  caps?: boolean;
  /** 0-based, as stored in w:outlineLvl. */
  outlineLvl?: number;
  pageBreakBefore?: boolean;
}

export function roleVisual(role: Role, spec: PackSpec): VisualSpec | undefined {
  const level = headingLevelOf(role);
  if (level) {
    const h = spec.headings[level];
    return {
      line: spec.lineBody,
      beforeTw: ptToTwips(h.spaceBeforePt),
      afterTw: ptToTwips(h.spaceAfterPt),
      firstLineTw: mmToTwips(h.firstLineIndentMm),
      jc: role === "appendix_heading" ? "center" : h.align,
      sz: ptToHalfPt(h.sizePt),
      bold: h.bold,
      caps: h.caps,
      outlineLvl: level - 1,
      pageBreakBefore: h.pageBreakBefore,
    };
  }
  const base = { line: spec.lineBody, beforeTw: 0, afterTw: 0, sz: spec.szBody };
  switch (role) {
    case "body":
    case "unknown":
      return { ...base, firstLineTw: spec.firstLineTwips, jc: BODY_ALIGN };
    case "list_item":
      return { ...base, firstLineTw: 0, noInd: true, jc: BODY_ALIGN };
    case "table_cell":
      return { ...base, line: spec.tableCell.line, firstLineTw: 0, jc: "left", sz: spec.tableCell.sz };
    case "figure_caption":
    case "table_caption":
      return {
        ...base,
        firstLineTw: 0,
        jc: role === "figure_caption" ? spec.caption.figureAlign : spec.caption.tableAlign,
        sz: spec.caption.sz,
        italic: spec.caption.italic,
      };
    case "bibliography_item":
      return {
        ...base,
        firstLineTw: spec.firstLineTwips,
        hangingTw: spec.bibliography.hangingTwips || undefined,
        jc: BODY_ALIGN,
      };
    default:
      return undefined;
  }
}

/** Writes spacing / ind / jc / outlineLvl / pageBreakBefore into a w:pPr. */
export function applyParagraphVisual(pPr: OrderedXmlNode, v: VisualSpec): void {
  setPropInOrder(
    pPr,
    "w:spacing",
    { "w:before": String(v.beforeTw), "w:after": String(v.afterTw), "w:line": String(v.line), "w:lineRule": "auto" },
    W_PPR_ORDER
  );
  if (!v.noInd) {
    const ind: Record<string, string> = v.hangingTw
      ? { "w:left": String(v.hangingTw), "w:hanging": String(v.hangingTw) }
      : { "w:firstLine": String(v.firstLineTw) };
    setPropInOrder(pPr, "w:ind", ind, W_PPR_ORDER);
  }
  setPropInOrder(pPr, "w:jc", { "w:val": v.jc }, W_PPR_ORDER);
  if (v.outlineLvl === undefined) removeChildren(pPr, "w:outlineLvl");
  else setPropInOrder(pPr, "w:outlineLvl", { "w:val": String(v.outlineLvl) }, W_PPR_ORDER);
  if (v.pageBreakBefore) setPropInOrder(pPr, "w:pageBreakBefore", {}, W_PPR_ORDER);
  else removeChildren(pPr, "w:pageBreakBefore");
}

/** Writes the font, size and heading emphasis of a visual into a w:rPr. */
export function applyRunVisual(rPr: OrderedXmlNode, v: VisualSpec, font: string): void {
  setPropInOrder(
    rPr,
    "w:rFonts",
    { "w:ascii": font, "w:hAnsi": font, "w:cs": font, "w:eastAsia": font },
    W_RPR_ORDER
  );
  setPropInOrder(rPr, "w:sz", { "w:val": String(v.sz) }, W_RPR_ORDER);
  setPropInOrder(rPr, "w:szCs", { "w:val": String(v.sz) }, W_RPR_ORDER);
  if (v.bold !== undefined) toggle(rPr, "w:b", v.bold);
  if (v.italic !== undefined) toggle(rPr, "w:i", v.italic);
  if (v.caps !== undefined) toggle(rPr, "w:caps", v.caps);
}

function toggle(rPr: OrderedXmlNode, tag: string, on: boolean): void {
  if (on) setPropInOrder(rPr, tag, {}, W_RPR_ORDER);
  else removeChildren(rPr, tag);
}
