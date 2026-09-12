/**
 * Child-ordering tables for the OOXML complex types the restyler writes into.
 *
 * docx-xml.ts appends new children at the end, which produces schema-invalid
 * pPr/rPr the moment a document already carries, say, a w:rPr inside w:pPr.
 * Every writer here goes through setChildInOrder instead, so a freshly added
 * child lands at its schema position and existing children never move.
 */

import { children, createNode, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";

/** CT_PPr sequence. */
export const W_PPR_ORDER = [
  "w:pStyle", "w:keepNext", "w:keepLines", "w:pageBreakBefore", "w:framePr",
  "w:widowControl", "w:numPr", "w:suppressLineNumbers", "w:pBdr", "w:shd",
  "w:tabs", "w:suppressAutoHyphens", "w:kinsoku", "w:wordWrap", "w:overflowPunct",
  "w:topLinePunct", "w:autoSpaceDE", "w:autoSpaceDN", "w:bidi", "w:adjustRightInd",
  "w:snapToGrid", "w:spacing", "w:ind", "w:contextualSpacing", "w:mirrorIndents",
  "w:suppressOverlap", "w:jc", "w:textDirection", "w:textAlignment",
  "w:textboxTightWrap", "w:outlineLvl", "w:divId", "w:cnfStyle", "w:rPr",
  "w:sectPr", "w:pPrChange",
] as const;

/** CT_RPr sequence. */
export const W_RPR_ORDER = [
  "w:rStyle", "w:rFonts", "w:b", "w:bCs", "w:i", "w:iCs", "w:caps", "w:smallCaps",
  "w:strike", "w:dstrike", "w:outline", "w:shadow", "w:emboss", "w:imprint",
  "w:noProof", "w:snapToGrid", "w:vanish", "w:webHidden", "w:color", "w:spacing",
  "w:w", "w:kern", "w:position", "w:sz", "w:szCs", "w:highlight", "w:u", "w:effect",
  "w:bdr", "w:shd", "w:fitText", "w:vertAlign", "w:rtl", "w:cs", "w:em", "w:lang",
  "w:eastAsianLayout", "w:specVanish", "w:oMath",
] as const;

/** CT_Style sequence (property children only; the tail is style-type specific). */
export const W_STYLE_ORDER = [
  "w:name", "w:aliases", "w:basedOn", "w:next", "w:link", "w:autoRedefine",
  "w:hidden", "w:uiPriority", "w:semiHidden", "w:unhideWhenUsed", "w:qFormat",
  "w:locked", "w:personal", "w:personalCompose", "w:personalReply", "w:rsid",
  "w:pPr", "w:rPr", "w:tblPr", "w:trPr", "w:tcPr", "w:tblStylePr",
] as const;

/** CT_Styles sequence. */
export const W_STYLES_ORDER = ["w:docDefaults", "w:latentStyles", "w:style"] as const;

/** CT_TblPrBase sequence. */
export const W_TBLPR_ORDER = [
  "w:tblStyle", "w:tblpPr", "w:tblOverlap", "w:bidiVisual", "w:tblStyleRowBandSize",
  "w:tblStyleColBandSize", "w:tblW", "w:jc", "w:tblCellSpacing", "w:tblInd",
  "w:tblBorders", "w:shd", "w:tblLayout", "w:tblCellMar", "w:tblLook",
  "w:tblCaption", "w:tblDescription", "w:tblPrChange",
] as const;

export type OrderTable = readonly string[];

function rankOf(order: OrderTable, tag: string | undefined): number {
  return tag ? order.indexOf(tag) : -1;
}

/**
 * Inserts `node` under `parent` at the position `order` prescribes, replacing
 * an existing child with the same tag in place. Unknown tags go to the end.
 */
export function setChildInOrder(
  parent: OrderedXmlNode,
  tag: string,
  node: OrderedXmlNode,
  order: OrderTable
): OrderedXmlNode {
  const ch = children(parent);
  const existing = ch.findIndex((c) => tag in c);
  if (existing >= 0) {
    ch[existing] = node;
    return node;
  }
  const rank = rankOf(order, tag);
  const at =
    rank < 0 ? -1 : ch.findIndex((c) => {
      const r = rankOf(order, tagName(c));
      return r >= 0 && r > rank;
    });
  if (at >= 0) ch.splice(at, 0, node);
  else ch.push(node);
  return node;
}

/** setChildInOrder for a leaf element described by its attributes. */
export function setPropInOrder(
  parent: OrderedXmlNode,
  tag: string,
  attrs: Record<string, string>,
  order: OrderTable
): OrderedXmlNode {
  return setChildInOrder(parent, tag, createNode(tag, attrs), order);
}

/** Finds a child by tag, creating an empty one at its schema position. */
export function ensureChildInOrder(
  parent: OrderedXmlNode,
  tag: string,
  order: OrderTable
): OrderedXmlNode {
  const existing = children(parent).find((c) => tag in c);
  if (existing) return existing;
  return setChildInOrder(parent, tag, createNode(tag), order);
}

/** Removes every direct child with the given tag. */
export function removeChildren(parent: OrderedXmlNode, tag: string): number {
  const ch = children(parent);
  let removed = 0;
  for (let i = ch.length - 1; i >= 0; i--) {
    if (tag in ch[i]) {
      ch.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}
