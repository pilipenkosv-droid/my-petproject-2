/**
 * The rule pack, resolved once into OOXML units.
 *
 * Rule packs speak millimetres and points; OOXML speaks twips, half-points and
 * 240ths of a line. Converting per paragraph would be both slow and a place for
 * rounding to drift, so every writer reads the numbers from here instead.
 */

import type { HeadingLevel, HeadingSpec, RulePack } from "@/lib/pipeline-v6/rule-packs/types";
import type { Role } from "../classify/types";

export const TWIPS_PER_MM = 56.6929;
export const DEFAULT_PAGE_MM = { w: 210, h: 297 };

/** Body text is justified under ГОСТ; the pack carries no field for it. */
export const BODY_ALIGN = "both";

export const mmToTwips = (mm: number): number => Math.round(mm * TWIPS_PER_MM);
export const ptToHalfPt = (pt: number): number => Math.round(pt * 2);
export const ptToTwips = (pt: number): number => Math.round(pt * 20);
export const spacingLine = (multiple: number): number => Math.round(multiple * 240);

export const STYLE_IDS = {
  body: "DpxBody",
  heading: (level: HeadingLevel) => `DpxHeading${level}`,
  caption: "DpxCaption",
  tableCell: "DpxTableCell",
  bibliography: "DpxBibliography",
  tocTitle: "DpxTocTitle",
} as const;

/** Roles whose pPr the restyler leaves entirely to the student. */
export const UNTOUCHED_PPR_ROLES: ReadonlySet<Role> = new Set<Role>([
  "title_page",
  "toc",
  "note",
  "header_footer",
  "empty",
  "formula",
]);

const DEFAULT_HEADING: HeadingSpec = {
  bold: true,
  caps: false,
  align: "left",
  sizePt: 14,
  spaceBeforePt: 12,
  spaceAfterPt: 12,
  pageBreakBefore: false,
  firstLineIndentMm: 12.5,
};

export interface PackSpec {
  font: string;
  /** Body size, half-points. */
  szBody: number;
  /** Body line spacing, 240ths. */
  lineBody: number;
  /** First-line indent of a body paragraph, twips. */
  firstLineTwips: number;
  pageMm: { w: number; h: number };
  marginsMm: { top: number; bottom: number; left: number; right: number };
  headings: Record<HeadingLevel, HeadingSpec>;
  caption: { figureAlign: string; tableAlign: string; sz: number; italic: boolean };
  tableCell: { sz: number; line: number };
  bibliography: { hangingTwips: number };
  tocTitle: string;
}

export function buildPackSpec(pack: RulePack): PackSpec {
  const v = pack.values;
  const h = v.headings;
  const cap = v.caption;
  const cell = v.tableCell;
  return {
    font: v.fontFamily,
    szBody: ptToHalfPt(v.fontSize),
    lineBody: spacingLine(v.lineSpacing),
    firstLineTwips: mmToTwips(v.paragraphIndent),
    pageMm: v.pageSize ?? DEFAULT_PAGE_MM,
    marginsMm: v.margins,
    headings: {
      1: h?.[1] ?? { ...DEFAULT_HEADING, pageBreakBefore: true },
      2: h?.[2] ?? DEFAULT_HEADING,
      3: h?.[3] ?? DEFAULT_HEADING,
    },
    caption: {
      figureAlign: cap?.align ?? "center",
      tableAlign: cap?.tableAlign ?? "left",
      sz: ptToHalfPt(cap?.sizePt ?? v.fontSize),
      italic: cap?.italic ?? false,
    },
    tableCell: {
      sz: ptToHalfPt(cell?.sizePt ?? v.fontSize),
      line: spacingLine(cell?.lineSpacing ?? 1),
    },
    bibliography: { hangingTwips: mmToTwips(v.bibliography?.hangingIndentMm ?? 0) },
    tocTitle: v.tocTitle,
  };
}

export function headingLevelOf(role: Role): HeadingLevel | undefined {
  if (role === "heading_L1" || role === "appendix_heading") return 1;
  if (role === "heading_L2") return 2;
  if (role === "heading_L3") return 3;
  return undefined;
}

/** Run size (half-points) the role asks for. */
export function runSizeFor(role: Role, spec: PackSpec): number {
  const level = headingLevelOf(role);
  if (level) return ptToHalfPt(spec.headings[level].sizePt);
  if (role === "table_cell") return spec.tableCell.sz;
  if (role === "figure_caption" || role === "table_caption") return spec.caption.sz;
  return spec.szBody;
}
