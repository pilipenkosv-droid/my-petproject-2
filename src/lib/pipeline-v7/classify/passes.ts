/**
 * The document-level passes of T0.
 *
 * Each of these needs the whole list in view — a region that runs until the
 * next heading, a title page that ends at the first break, a heading count that
 * only means something as a share — so they run after the per-paragraph rules
 * rather than inside them.
 */

import { isBibliographyHeading, isTocEntry, isTocName } from "./patterns";
import { headingRole, isHeadingRole, type ClassifiedParagraph, type Role } from "./types";

const TITLE_PAGE_CAP = 40;
const HEADING_SHARE_LIMIT = 0.4;

/**
 * Paragraphs under a bibliography heading, whatever its level.
 *
 * "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ" is a numbered subsection in plenty of
 * papers, so the region opens on any heading level and closes on the next
 * heading of the same or a shallower level (a deeper one is still inside it),
 * or on an appendix.
 */
export function applyBibliographyRegion(list: ClassifiedParagraph[], from: number, to: number): void {
  const OVERRIDABLE: Role[] = ["unknown", "body", "list_item"];
  let openLevel = 0;
  for (let i = from; i < to; i++) {
    const cp = list[i];
    if (cp.role === "appendix_heading") {
      openLevel = 0;
      continue;
    }
    if (isHeadingRole(cp.role)) {
      const level = Number(cp.role.slice(-1));
      if (openLevel > 0 && level <= openLevel) openLevel = 0;
      if (openLevel === 0 && isBibliographyHeading(cp.text ?? "")) openLevel = level;
      continue;
    }
    if (openLevel === 0) continue;
    if (cp.role === "table_cell" || cp.text === "") continue;
    if (!OVERRIDABLE.includes(cp.role)) continue;
    cp.role = "bibliography_item";
    cp.confidence = 0.9;
    cp.source = "region";
  }
}

/**
 * Lines of a table of contents the student typed by hand.
 *
 * T0 has no style to go on — the entries are plain paragraphs — so the only
 * evidence is shape, and shape alone is far too weak to use document-wide. The
 * region makes it safe: it opens on the «СОДЕРЖАНИЕ» line and closes at the
 * next real heading, which for a contents page is the first section of the
 * paper. Only `unknown` and `body` are overridden; anything T0 proved from the
 * file stands.
 *
 * Marking them `toc` is what lets the rest of the pipeline treat the block as
 * a table of contents: `text-norm` leaves it alone, the underline survives,
 * `sectionFilled` counts it as listed, and the restyler gives it a TOC1 style
 * the checker recognises.
 */
export function applyTocRegion(list: ClassifiedParagraph[], from: number, to: number): void {
  const OVERRIDABLE: Role[] = ["unknown", "body"];
  let open = false;
  for (let i = from; i < to; i++) {
    const cp = list[i];
    const text = cp.text ?? "";
    if (isTocName(text) && (isHeadingRole(cp.role) || cp.role === "toc")) {
      open = true;
      continue;
    }
    if (!open) continue;
    if (isHeadingRole(cp.role) || cp.role === "appendix_heading") break;
    if (cp.role === "table_cell" || text === "") continue;
    if (!OVERRIDABLE.includes(cp.role)) continue;
    if (!isTocEntry(text)) continue;
    cp.role = "toc";
    cp.confidence = 0.9;
    cp.source = "toc-entry";
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

export function applyTitlePage(list: ClassifiedParagraph[], from: number, to: number): void {
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

/** Confidence a bare "N. Something" keeps when no formatting confirms it. */
const WEAK_NUMBERED_CONFIDENCE = 0.5;

/** Size difference from the body, in half-points, that reads as a heading. */
const SIZE_DELTA = 2;

/**
 * A paragraph promoted on its leading number alone keeps the promotion only if
 * something about its formatting says "heading": every run bold, near-all
 * caps, kept with the next block, followed by an empty line, or set in a size
 * unlike the body. Without one it drops back to `unknown` at half confidence —
 * where the LLM residue layer can pick it up — because the regex matches
 * "1.5 млн рублей" just as happily as "1.5 Методика расчёта".
 */
export function applyNumberedSignals(
  list: ClassifiedParagraph[],
  candidates: number[],
  modal: number | undefined
): number {
  let demoted = 0;
  for (const i of candidates) {
    const cp = list[i];
    const f = cp.features;
    const next = list[i + 1];
    const sizeOff = modal !== undefined && f?.sz !== undefined && Math.abs(f.sz - modal) >= SIZE_DELTA;
    const signal =
      f?.boldAll === true ||
      (f?.capsRatio ?? 0) >= 0.8 ||
      f?.keepNext === true ||
      sizeOff ||
      (next !== undefined && next.part === cp.part && next.text === "");
    if (signal) continue;
    cp.role = "unknown";
    cp.confidence = WEAK_NUMBERED_CONFIDENCE;
    demoted += 1;
  }
  return demoted;
}

export function modalSize(list: ClassifiedParagraph[]): number | undefined {
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
