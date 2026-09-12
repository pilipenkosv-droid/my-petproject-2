/**
 * Minimal word/numbering.xml reader: enough to tell a numbered heading from a
 * plain list item. Word expresses "Heading 1 is numbered 1., 1.1., 1.1.1." by
 * linking an abstract numbering to a heading style, so a w:numPr on such a
 * paragraph means heading, not bullet.
 */

import { children, findChild, getAttr, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { DocxPackage } from "../docx/package";
import type { StyleIndex } from "./styles";

interface AbstractNum {
  /** w:styleLink / w:pStyleLink — this numbering IS the numbering of that style. */
  styleLink?: string;
  /** w:numStyleLink — this numbering delegates to that style's numbering. */
  numStyleLink?: string;
  /** ilvl → w:pStyle/@w:val of that level. */
  levelStyles: Map<number, string>;
}

export interface NumberingIndex {
  numToAbstract: Map<string, string>;
  abstract: Map<string, AbstractNum>;
  /** Heading level implied by numId+ilvl, or undefined for a plain list. */
  headingLevelFor(numId: string | undefined, ilvl: number, styles: StyleIndex): number | undefined;
}

function readAbstract(node: OrderedXmlNode): AbstractNum {
  const out: AbstractNum = { levelStyles: new Map() };
  for (const child of children(node)) {
    const tag = tagName(child);
    if (tag === "w:styleLink" || tag === "w:pStyleLink") out.styleLink = getAttr(child, "w:val");
    else if (tag === "w:numStyleLink") out.numStyleLink = getAttr(child, "w:val");
    else if (tag === "w:lvl") {
      const ilvl = Number(getAttr(child, "w:ilvl") ?? "0");
      const pStyle = findChild(child, "w:pStyle");
      const val = pStyle ? getAttr(pStyle, "w:val") : undefined;
      if (val) out.levelStyles.set(ilvl, val);
    }
  }
  return out;
}

export async function buildNumberingIndex(pkg: DocxPackage): Promise<NumberingIndex> {
  const numToAbstract = new Map<string, string>();
  const abstract = new Map<string, AbstractNum>();
  const nodes = (await pkg.part("word/numbering.xml")) ?? [];
  const root = nodes.find((n) => "w:numbering" in n);
  for (const child of root ? children(root) : []) {
    const tag = tagName(child);
    if (tag === "w:num") {
      const numId = getAttr(child, "w:numId");
      const link = findChild(child, "w:abstractNumId");
      const abstractId = link ? getAttr(link, "w:val") : undefined;
      if (numId && abstractId) numToAbstract.set(numId, abstractId);
    } else if (tag === "w:abstractNum") {
      const id = getAttr(child, "w:abstractNumId");
      if (id) abstract.set(id, readAbstract(child));
    }
  }
  return {
    numToAbstract,
    abstract,
    headingLevelFor: (numId, ilvl, styles) =>
      headingLevelFor({ numToAbstract, abstract }, numId, ilvl, styles),
  };
}

function headingLevelFor(
  idx: { numToAbstract: Map<string, string>; abstract: Map<string, AbstractNum> },
  numId: string | undefined,
  ilvl: number,
  styles: StyleIndex
): number | undefined {
  if (!numId) return undefined;
  const abstractId = idx.numToAbstract.get(numId);
  if (!abstractId) return undefined;
  const abs = idx.abstract.get(abstractId);
  if (!abs) return undefined;
  for (const linked of [abs.styleLink, abs.numStyleLink, abs.levelStyles.get(ilvl)]) {
    const level = linked ? styles.resolveHeadingLevel(linked) : undefined;
    if (level !== undefined) return level;
  }
  return undefined;
}
