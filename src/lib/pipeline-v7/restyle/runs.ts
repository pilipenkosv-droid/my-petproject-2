/**
 * Direct run formatting.
 *
 * The rule is subtractive: normalise the font and the size, drop the handful of
 * properties that fight a ГОСТ look (colour, highlight, shading, character
 * spacing/scale/kerning/position), and keep everything that carries meaning —
 * bold, italic, underline, strikethrough, sub/superscript, language, caps.
 *
 * Structure is never touched. Field runs (fldChar/instrText) and runs that hold
 * a drawing or an embedded object get the font and size only; math runs are
 * skipped outright, because m:rPr is a different schema.
 */

import {
  children,
  ensureRPr,
  findChild,
  getAttr,
  removeAttr,
  tagName,
  type OrderedXmlNode,
} from "@/lib/xml/docx-xml";
import type { RulePack } from "@/lib/pipeline-v6/rule-packs/types";
import type { Role } from "../classify/types";
import { W_RPR_ORDER, removeChildren, setPropInOrder } from "./ooxml-order";
import { buildPackSpec, headingLevelOf, runSizeFor, type PackSpec } from "./spec";

/** Containers whose runs belong to this paragraph. */
const DESCEND = new Set([
  "w:hyperlink", "w:ins", "w:smartTag", "w:fldSimple", "w:sdt", "w:sdtContent", "w:customXml",
]);

/** Deleted text, text boxes and math are other people's business. */
const SKIP = new Set(["w:del", "w:txbxContent", "m:oMath", "m:oMathPara", "w:pPr"]);

/** Run children that make a run structural rather than textual. */
const SPECIAL = new Set(["w:drawing", "w:pict", "w:object", "w:fldChar", "w:instrText"]);

const THEME_ATTRS = ["w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme"];

/** Direct rPr children that would override the pack's look. */
const DROP = ["w:highlight", "w:shd", "w:spacing", "w:w", "w:kern", "w:position"];

export interface RunOpts {
  spec?: PackSpec;
  /** Character styles that carry a font or size; their w:rStyle is dropped. */
  fontStyleIds?: ReadonlySet<string>;
  /** Mutated in place: how many w:u were dropped. */
  counters?: { underlineRemoved: number };
}

/**
 * Roles whose underline is left alone. ГОСТ forbids underlining, but a TOC
 * entry and a title page carry it as the document's own presentation — and a
 * TOC's underline comes from its hyperlinks, which the restyler never touches.
 */
const KEEP_UNDERLINE: ReadonlySet<Role> = new Set<Role>(["toc", "title_page"]);

interface RunRef {
  node: OrderedXmlNode;
  hyperlink: boolean;
}

function* collectRuns(node: OrderedXmlNode, inLink: boolean): Generator<RunRef> {
  for (const child of children(node)) {
    const tag = tagName(child);
    if (!tag || SKIP.has(tag)) continue;
    if (tag === "w:r") yield { node: child, hyperlink: inLink };
    else if (DESCEND.has(tag)) yield* collectRuns(child, inLink || tag === "w:hyperlink");
  }
}

function isSpecial(run: OrderedXmlNode): boolean {
  return children(run).some((c) => {
    const tag = tagName(c);
    return tag !== undefined && SPECIAL.has(tag);
  });
}

function setFontAndSize(rPr: OrderedXmlNode, font: string, sz: number): void {
  const rFonts = setPropInOrder(
    rPr,
    "w:rFonts",
    { "w:ascii": font, "w:hAnsi": font, "w:cs": font, "w:eastAsia": font },
    W_RPR_ORDER
  );
  for (const attr of THEME_ATTRS) removeAttr(rFonts, attr);
  setPropInOrder(rPr, "w:sz", { "w:val": String(sz) }, W_RPR_ORDER);
  setPropInOrder(rPr, "w:szCs", { "w:val": String(sz) }, W_RPR_ORDER);
}

function stripRStyle(rPr: OrderedXmlNode, ids: ReadonlySet<string> | undefined): void {
  if (!ids?.size) return;
  const node = findChild(rPr, "w:rStyle");
  const val = node ? getAttr(node, "w:val") : undefined;
  if (val && ids.has(val)) removeChildren(rPr, "w:rStyle");
}

/** Normalises every run of a paragraph for its role. Returns the run count. */
export function restyleRuns(
  pNode: OrderedXmlNode,
  role: Role,
  pack: RulePack,
  opts: RunOpts = {}
): number {
  const spec = opts.spec ?? buildPackSpec(pack);
  const sz = runSizeFor(role, spec);
  const level = headingLevelOf(role);
  const heading = level ? spec.headings[level] : undefined;
  let touched = 0;
  for (const { node, hyperlink } of collectRuns(pNode, false)) {
    const rPr = ensureRPr(node);
    setFontAndSize(rPr, spec.font, sz);
    touched += 1;
    if (isSpecial(node)) continue;
    for (const tag of DROP) removeChildren(rPr, tag);
    if (!hyperlink) removeChildren(rPr, "w:color");
    stripRStyle(rPr, opts.fontStyleIds);
    if (!KEEP_UNDERLINE.has(role)) {
      const dropped = removeChildren(rPr, "w:u");
      if (dropped && opts.counters) opts.counters.underlineRemoved += dropped;
    }
    if (!heading) continue;
    if (heading.bold) setPropInOrder(rPr, "w:b", {}, W_RPR_ORDER);
    if (heading.caps) setPropInOrder(rPr, "w:caps", {}, W_RPR_ORDER);
  }
  return touched;
}
