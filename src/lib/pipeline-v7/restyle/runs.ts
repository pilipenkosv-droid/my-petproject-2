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
  findChildren,
  getAttr,
  getText,
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
const DROP = ["w:shd", "w:spacing", "w:w", "w:kern", "w:position"];

export interface RunOpts {
  spec?: PackSpec;
  /** Character styles that carry a font or size; their w:rStyle is dropped. */
  fontStyleIds?: ReadonlySet<string>;
  /** Mutated in place: how many w:u were dropped. */
  counters?: { underlineRemoved: number };
}

/**
 * Roles whose underline is left alone — only the TOC, whose underline comes
 * from its own hyperlinks.
 *
 * `title_page` used to be here too, on the reading that a title page carries
 * its underlines as the document's own presentation. The owner decided
 * otherwise (2026-09-19): ГОСТ forbids underlining, the score production shows
 * the student is computed without roles, and the checker therefore charges for
 * every underlined title-page run. Underlining goes everywhere but the TOC.
 *
 * The one thing that must survive is the blank line left for a handwritten
 * signature: see `keepsItsWidth`.
 */
const KEEP_UNDERLINE: ReadonlySet<Role> = new Set<Role>(["toc"]);

/** Underscores, spaces and tabs — a run that is a ruled line, not a word. */
const BLANK_RUN = /^[\s\u00a0_]+$/;

/**
 * True when this run is the blank space under a signature rather than text.
 *
 * Dropping `w:u` from such a run would leave nothing on the page where the
 * student has to sign. The characters stay exactly as they are — underscores
 * already draw their own line, and whitespace keeps the gap — but the node has
 * to say `xml:space="preserve"`, or the serializer collapses the gap away.
 */
function keepsItsWidth(run: OrderedXmlNode): boolean {
  const texts = findChildren(run, "w:t");
  if (!texts.length) return false;
  const joined = texts.map((t) => getText(t)).join("");
  if (joined.length === 0 || !BLANK_RUN.test(joined)) return false;
  for (const t of texts) t[":@"] = { ...(t[":@"] ?? {}), "@_xml:space": "preserve" };
  return true;
}

/**
 * Strips `w:u` unless the role keeps it. A `w:u w:val="none"` is dropped
 * whatever the role: it states the absence of an underline, renders
 * identically without it, and the checker counts any `w:u` element at all.
 */
function dropUnderline(rPr: OrderedXmlNode, run: OrderedXmlNode, role: Role): number {
  const u = findChild(rPr, "w:u");
  if (!u) return 0;
  if (KEEP_UNDERLINE.has(role) && getAttr(u, "w:val") !== "none") return 0;
  keepsItsWidth(run);
  return removeChildren(rPr, "w:u");
}

function* collectRuns(node: OrderedXmlNode): Generator<OrderedXmlNode> {
  for (const child of children(node)) {
    const tag = tagName(child);
    if (!tag || SKIP.has(tag)) continue;
    if (tag === "w:r") yield child;
    else if (DESCEND.has(tag)) yield* collectRuns(child);
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
  for (const node of collectRuns(pNode)) {
    const rPr = ensureRPr(node);
    setFontAndSize(rPr, spec.font, sz);
    touched += 1;
    // Colour, highlight and underline are stripped from every run, structural
    // ones included: a fldChar or a drawing anchor carries no visible text, so
    // its colour is nothing but a checker failure. Everything else below is
    // still skipped for those runs — spacing and rStyle are part of how they
    // are laid out.
    removeChildren(rPr, "w:highlight");
    // Hyperlink colour used to be kept as the document's own presentation.
    // ГОСТ wants plain black text, and the checker charges for any colour that
    // is neither auto nor 000000, so the link loses its blue with the rest.
    removeChildren(rPr, "w:color");
    const dropped = dropUnderline(rPr, node, role);
    if (dropped && opts.counters) opts.counters.underlineRemoved += dropped;
    if (isSpecial(node)) continue;
    for (const tag of DROP) removeChildren(rPr, tag);
    stripRStyle(rPr, opts.fontStyleIds);
    if (!heading) continue;
    if (heading.bold) setPropInOrder(rPr, "w:b", {}, W_RPR_ORDER);
    if (heading.caps) setPropInOrder(rPr, "w:caps", {}, W_RPR_ORDER);
  }
  return touched;
}
