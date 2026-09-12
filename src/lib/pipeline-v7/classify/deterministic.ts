/**
 * T0 — the deterministic classification layer.
 *
 * Rules are tried in a fixed order and the first hit wins, so a fact written
 * into the file (outline level, style, numbering) always beats a guess made
 * from the text. Two region passes (bibliography, title page) and a coherence
 * pass run afterwards, because they need the whole document in view.
 *
 * Nothing here invents a `body` role: whatever T0 cannot prove stays
 * `unknown`, which is exactly the residue the later LLM layer consumes.
 */

import type { OrderedXmlNode } from "@/lib/xml/docx-xml";
import { walkBlocks, paragraphText } from "../docx/walk";
import type { DocxPackage } from "../docx/package";
import type { BlockRef, ContentPartRef } from "../types";
import { buildStyleIndex, type StyleIndex } from "./styles";
import { buildNumberingIndex, type NumberingIndex } from "./numbering";
import { paragraphFeatures, type ParagraphFeatures } from "./features";
import {
  isBibliographyHeading,
  matchCaption,
  matchNumberedHeading,
  matchSectionName,
  normalizeText,
} from "./patterns";
import {
  emptyHistogram,
  headingRole,
  isHeadingRole,
  type ClassificationResult,
  type ClassifiedParagraph,
  type ClassifySource,
  type Role,
} from "./types";

const TITLE_PAGE_CAP = 40;
const HEADING_SHARE_LIMIT = 0.4;

interface Verdict {
  role: Role;
  confidence: number;
  source: ClassifySource;
}

interface Ctx {
  styles: StyleIndex;
  numbering: NumberingIndex;
  part: ContentPartRef;
  block: BlockRef;
  text: string;
  f: ParagraphFeatures;
}

const UNKNOWN: Verdict = { role: "unknown", confidence: 0, source: "none" };

function byStyle(ctx: Ctx): Verdict | undefined {
  const id = ctx.f.styleId;
  if (!id) return undefined;
  if (ctx.styles.isTocStyle(id)) return { role: "toc", confidence: 1, source: "style" };
  const level = ctx.styles.resolveHeadingLevel(id);
  if (level !== undefined) return { role: headingRole(level), confidence: 1, source: "style" };
  if (ctx.styles.isCaptionStyle(id)) {
    const byText = matchCaption(ctx.text);
    return byText
      ? { ...byText, source: "caption-re" }
      : { role: "figure_caption", confidence: 0.8, source: "style" };
  }
  return undefined;
}

function byNumbering(ctx: Ctx): Verdict | undefined {
  const numPr = ctx.f.numPr;
  if (!numPr) return undefined;
  const level = ctx.numbering.headingLevelFor(numPr.numId, numPr.ilvl, ctx.styles);
  if (level !== undefined) {
    return { role: headingRole(numPr.ilvl + 1), confidence: 0.9, source: "numPr" };
  }
  return { role: "list_item", confidence: 0.9, source: "numPr" };
}

function byPosition(ctx: Ctx): Verdict | undefined {
  if (ctx.block.inTableDepth > 0) return { role: "table_cell", confidence: 1, source: "position" };
  const kind = ctx.part.kind;
  if (kind === "footnotes" || kind === "endnotes") {
    return { role: "note", confidence: 1, source: "position" };
  }
  if (kind === "header" || kind === "footer") {
    return { role: "header_footer", confidence: 1, source: "position" };
  }
  return undefined;
}

function byMath(ctx: Ctx): Verdict | undefined {
  if (!ctx.f.hasMath) return undefined;
  if (ctx.text.length < 20) return { role: "formula", confidence: 1, source: "omath" };
  return { role: "body", confidence: 0.6, source: "omath" };
}

function classifyOne(ctx: Ctx): Verdict {
  if (ctx.f.outlineLvl !== undefined) {
    return { role: headingRole(ctx.f.outlineLvl + 1), confidence: 1, source: "outlineLvl" };
  }
  const fromStyle = byStyle(ctx);
  if (fromStyle) return fromStyle;
  const fromNum = byNumbering(ctx);
  if (fromNum) return fromNum;
  const fromPos = byPosition(ctx);
  if (fromPos) return fromPos;
  if (ctx.text !== "") {
    const caption = matchCaption(ctx.text);
    if (caption) return { ...caption, source: "caption-re" };
    const section = matchSectionName(ctx.text);
    if (section) return { ...section, source: "section-re" };
    const numbered = matchNumberedHeading(ctx.text);
    if (numbered) return { ...numbered, source: "numbered-re" };
  }
  const math = byMath(ctx);
  if (math) return math;
  if (ctx.text === "" && !ctx.f.hasDrawing) {
    return { role: "empty", confidence: 1, source: "empty" };
  }
  return UNKNOWN;
}

/** Paragraphs after a bibliography heading and before the next L1 heading. */
function applyBibliographyRegion(list: ClassifiedParagraph[], from: number, to: number): void {
  const OVERRIDABLE: Role[] = ["unknown", "body", "list_item"];
  let inRegion = false;
  for (let i = from; i < to; i++) {
    const cp = list[i];
    if (cp.role === "heading_L1" || cp.role === "appendix_heading") {
      inRegion = cp.role === "heading_L1" && isBibliographyHeading(cp.text ?? "");
      continue;
    }
    if (!inRegion) continue;
    if (cp.role === "table_cell" || cp.text === "") continue;
    if (!OVERRIDABLE.includes(cp.role)) continue;
    cp.role = "bibliography_item";
    cp.confidence = 0.9;
    cp.source = "region";
  }
}

function titlePageEnd(list: ClassifiedParagraph[], from: number, to: number): number {
  const limit = Math.min(to, from + TITLE_PAGE_CAP);
  for (let i = from; i < limit; i++) {
    const cp = list[i];
    if (cp.role === "heading_L1" || cp.role === "toc" || cp.role === "appendix_heading") return i;
    const f = cp.features;
    if (f?.pageBreakBefore && i > from) return i;
    if (f?.hasPageBreakRun) return i + 1;
  }
  return limit;
}

function applyTitlePage(list: ClassifiedParagraph[], from: number, to: number): void {
  const end = titlePageEnd(list, from, to);
  for (let i = from; i < end; i++) {
    const cp = list[i];
    if (cp.role !== "unknown" && cp.role !== "body") continue;
    cp.role = "title_page";
    cp.confidence = 0.8;
    cp.source = "titlepage";
  }
}

/** A heading may deepen by at most one level relative to the previous heading. */
export function applyCoherence(list: ClassifiedParagraph[], warnings: string[]): void {
  let prev = 0;
  for (const cp of list) {
    if (!isHeadingRole(cp.role)) continue;
    const level = Number(cp.role.slice(-1));
    if (level > prev + 1) {
      const fixed = prev + 1;
      warnings.push(`coherence: ${cp.path} demoted heading_L${level} → heading_L${fixed}`);
      cp.role = headingRole(fixed);
      prev = fixed;
    } else {
      prev = level;
    }
  }
}

/** Too many headings means the heuristics misfired; drop the guessed ones. */
export function applySuspect(list: ClassifiedParagraph[], warnings: string[]): boolean {
  const scope = list.filter((cp) => cp.role !== "empty" && cp.role !== "table_cell");
  const headings = scope.filter((cp) => isHeadingRole(cp.role));
  if (scope.length === 0 || headings.length / scope.length <= HEADING_SHARE_LIMIT) return false;
  warnings.push(
    `suspect: ${headings.length}/${scope.length} paragraphs classified as headings; ` +
      "demoting every heading not backed by outlineLvl or a style"
  );
  for (const cp of headings) {
    if (cp.source === "outlineLvl" || cp.source === "style") continue;
    cp.role = "unknown";
    cp.confidence = 0;
    cp.source = "none";
  }
  return true;
}

function modalSize(list: ClassifiedParagraph[]): number | undefined {
  const counts = new Map<number, number>();
  for (const cp of list) {
    if (isHeadingRole(cp.role) || cp.role === "empty") continue;
    const sz = cp.features?.sz;
    if (sz === undefined) continue;
    counts.set(sz, (counts.get(sz) ?? 0) + 1);
  }
  let best: number | undefined;
  for (const [sz, c] of counts) if (best === undefined || c > (counts.get(best) ?? 0)) best = sz;
  return best;
}

export async function classifyDocument(pkg: DocxPackage): Promise<ClassificationResult> {
  const styles = await buildStyleIndex(pkg);
  const numbering = await buildNumberingIndex(pkg);
  const list: ClassifiedParagraph[] = [];
  const byNode = new WeakMap<OrderedXmlNode, ClassifiedParagraph>();
  const warnings: string[] = [];
  const docRanges: [number, number][] = [];

  for (const part of await pkg.contentParts()) {
    const nodes = await pkg.part(part.name);
    if (!nodes) {
      warnings.push(`part not readable: ${part.name}`);
      continue;
    }
    const start = list.length;
    for (const block of walkBlocks(nodes)) {
      if (block.kind !== "p") continue;
      const text = normalizeText(paragraphText(block.node));
      const f = paragraphFeatures(block.node, text);
      const verdict = classifyOne({ styles, numbering, part, block, text, f });
      const cp: ClassifiedParagraph = {
        node: block.node,
        path: block.path,
        part: part.name,
        role: verdict.role,
        confidence: verdict.confidence,
        source: verdict.source,
        text,
        features: f,
      };
      if (f.hasMath && verdict.role !== "formula") cp.hasInlineMath = true;
      list.push(cp);
      byNode.set(block.node, cp);
    }
    if (part.kind === "document") docRanges.push([start, list.length]);
  }

  for (const [from, to] of docRanges) {
    applyBibliographyRegion(list, from, to);
    applyTitlePage(list, from, to);
  }
  applyCoherence(list, warnings);
  const suspect = applySuspect(list, warnings);

  const histogram = emptyHistogram();
  for (const cp of list) histogram[cp.role] += 1;
  return { byNode, list, histogram, warnings, suspect, modalBodySize: modalSize(list) };
}
