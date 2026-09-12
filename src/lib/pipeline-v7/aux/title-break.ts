/**
 * The section break after the title page.
 *
 * The v6 checker accepts nothing softer than a real `w:sectPr` in the w:pPr of
 * a title-page paragraph (or of one of the five paragraphs that follow), so a
 * `w:pageBreakBefore` would not satisfy it. What is inserted is therefore a
 * copy of the section that already governs the title page, with an explicit
 * `w:type` of nextPage: the layout of both halves is unchanged and only the
 * page break is new. That is allowance A7, and the gate checks the copy really
 * does equal its successor.
 */

import { children, createNode, setAttr, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { enumerateSectPr, ensureSectPrChild } from "../docx/sectpr";
import { W_PPR_ORDER, removeChildren, setChildInOrder } from "../restyle/ooxml-order";
import type { DocxPackage } from "../docx/package";
import { mainPart, titleRegionEnd, type MainPart } from "./common";

/** How far past the title page the checker still accepts a section break. */
const LOOKAHEAD = 5;

function pPrOf(p: OrderedXmlNode): OrderedXmlNode {
  const ch = children(p);
  const existing = ch.find((c) => "w:pPr" in c);
  if (existing) return existing;
  const node = createNode("w:pPr");
  ch.unshift(node);
  return node;
}

function hasSectPr(p: OrderedXmlNode): boolean {
  const pPr = children(p).find((c) => "w:pPr" in c);
  return pPr !== undefined && children(pPr).some((c) => "w:sectPr" in c);
}

/** True when the checker would already pass: a break at or just after `at`. */
function alreadyBroken(part: MainPart, at: number): boolean {
  let seen = 0;
  for (let i = at; i < part.blocks.length && seen <= LOOKAHEAD; i++) {
    const node = part.blocks[i];
    if (!("w:p" in node)) continue;
    if (hasSectPr(node)) return true;
    if (i > at) seen += 1;
  }
  return false;
}

/**
 * The live w:sectPr that governs the paragraph at body index `at`: the first
 * one in document order that sits after it. A body-level w:sectPr always does.
 */
function governingSectPr(part: MainPart, at: number): OrderedXmlNode | undefined {
  const after = new Set(part.blocks.slice(at + 1).filter((n) => "w:p" in n));
  for (const ref of enumerateSectPr(part.nodes)) {
    if (ref.scope === "body") return ref.node;
    if (ref.paragraph && after.has(ref.paragraph)) return ref.node;
  }
  return undefined;
}

export interface TitleBreakResult {
  inserted: boolean;
  /** No title page, or a section break was already there. */
  skipped: "no-title" | "already" | "no-section" | null;
  /** A w:pageBreakBefore the restyler had added was taken back off. */
  redundantBreakRemoved: boolean;
}

/**
 * The section break already starts a new page, so a w:pageBreakBefore on the
 * block right after it would leave a blank one. Only breaks the restyler itself
 * added are taken back off — one the student wrote stays.
 */
function dropRedundantBreak(part: MainPart, at: number, added: Set<OrderedXmlNode>): boolean {
  const next = part.blocks.slice(at + 1).find((n) => "w:p" in n || "w:tbl" in n);
  if (!next || !added.has(next)) return false;
  const pPr = children(next).find((c) => "w:pPr" in c);
  if (!pPr) return false;
  removeChildren(pPr, "w:pageBreakBefore");
  return true;
}

export async function insertTitleBreak(
  pkg: DocxPackage,
  roles: Map<OrderedXmlNode, string>,
  addedPageBreak: Set<OrderedXmlNode> = new Set()
): Promise<TitleBreakResult> {
  const miss = (skipped: TitleBreakResult["skipped"]): TitleBreakResult => ({
    inserted: false,
    skipped,
    redundantBreakRemoved: false,
  });
  const part = await mainPart(pkg);
  if (!part) return miss("no-title");
  const end = titleRegionEnd(part, roles);
  if (typeof end !== "number") return miss("no-title");
  const at = end;
  if (alreadyBroken(part, at)) return miss("already");

  const governing = governingSectPr(part, at);
  if (!governing) return miss("no-section");

  const clone = structuredClone(governing) as OrderedXmlNode;
  setAttr(ensureSectPrChild(clone, "w:type"), "w:val", "nextPage");
  setChildInOrder(pPrOf(part.blocks[at]), "w:sectPr", clone, W_PPR_ORDER);
  const redundantBreakRemoved = dropRedundantBreak(part, at, addedPageBreak);
  pkg.markDirty(part.name);
  return { inserted: true, skipped: null, redundantBreakRemoved };
}
