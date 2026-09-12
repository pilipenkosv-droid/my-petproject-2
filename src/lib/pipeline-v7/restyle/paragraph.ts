/**
 * Direct paragraph formatting.
 *
 * A canonical style alone is not enough: the checker reads w:pPr without
 * resolving the cascade, and a document full of direct formatting would win
 * over the style anyway. So the role's visual is written twice — as w:pStyle
 * and as explicit spacing / ind / jc — and the handful of direct properties
 * that would fight it are removed.
 *
 * Everything not named here survives: keepNext, keepLines, widowControl, tabs,
 * numPr, sectPr, bidi and the paragraph mark's own rPr.
 */

import { children, ensurePPr, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { RulePack } from "@/lib/pipeline-v6/rule-packs/types";
import type { Role } from "../classify/types";
import { W_PPR_ORDER, removeChildren, setPropInOrder } from "./ooxml-order";
import { STYLE_IDS, UNTOUCHED_PPR_ROLES, buildPackSpec, headingLevelOf, type PackSpec } from "./spec";
import { applyParagraphVisual, roleVisual } from "./visual";

export interface RestyleCtx {
  spec: PackSpec;
  /**
   * The previous paragraph ends a section. Its break already starts a new page,
   * so a w:pageBreakBefore here would leave a blank one between the two.
   */
  prevHasSectPr?: boolean;
  /**
   * Filled with every paragraph that gained a w:pageBreakBefore it did not
   * have. The aux step reads it to undo the break it makes redundant by
   * inserting a section break in front of it.
   */
  addedPageBreak?: Set<OrderedXmlNode>;
}

/** True when the paragraph already carries a w:pageBreakBefore. */
export function hasPageBreakBefore(pPr: OrderedXmlNode): boolean {
  return children(pPr).some((c) => "w:pageBreakBefore" in c);
}

export function makeCtx(pack: RulePack): RestyleCtx {
  return { spec: buildPackSpec(pack) };
}

/** Direct pPr children that would override the role's visual. */
const CONFLICTING = ["w:shd", "w:pBdr", "w:framePr"] as const;

export function styleIdFor(role: Role): string | undefined {
  const level = headingLevelOf(role);
  if (level) return STYLE_IDS.heading(level);
  switch (role) {
    case "body":
    case "unknown":
      return STYLE_IDS.body;
    // A list item carries its indents in w:numPr, so it needs a style with no
    // w:ind of its own: DpxBody's first-line indent would fight the numbering.
    case "list_item":
      return STYLE_IDS.listItem;
    case "table_cell":
      return STYLE_IDS.tableCell;
    case "figure_caption":
    case "table_caption":
      return STYLE_IDS.caption;
    case "bibliography_item":
      return STYLE_IDS.bibliography;
    default:
      return undefined;
  }
}

/**
 * Rewrites one paragraph's pPr for its role. Returns false for the roles whose
 * layout stays the student's — the title page above all.
 */
export function restyleParagraph(
  pNode: OrderedXmlNode,
  role: Role,
  pack: RulePack,
  ctx: RestyleCtx = makeCtx(pack)
): boolean {
  if (UNTOUCHED_PPR_ROLES.has(role)) return false;
  const visual = roleVisual(role, ctx.spec);
  const styleId = styleIdFor(role);
  if (!visual || !styleId) return false;

  const pPr = ensurePPr(pNode);
  const had = hasPageBreakBefore(pPr);
  const applied = ctx.prevHasSectPr ? { ...visual, pageBreakBefore: false } : visual;
  setPropInOrder(pPr, "w:pStyle", { "w:val": styleId }, W_PPR_ORDER);
  applyParagraphVisual(pPr, applied);
  if (!had && applied.pageBreakBefore === true) ctx.addedPageBreak?.add(pNode);
  for (const tag of CONFLICTING) removeChildren(pPr, tag);
  return true;
}
