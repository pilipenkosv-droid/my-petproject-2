/**
 * When the aux layer is allowed to add anything at all.
 *
 * Restyling is safe on any document — fonts and margins on a fragment are
 * harmless. Insertions are not: a TOC field printed into a document that has
 * nothing to list, or above a «СОДЕРЖАНИЕ» the student typed themselves,
 * displaces their own text and reads as damage (D-1/D-6, ADR 014).
 *
 * So both inserters ask here first, and the answer is a named reason that goes
 * into `statistics.v7` — a silent skip cannot be counted later.
 */

import type { OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { ClassificationResult } from "../classify/types";
import type { MainPart } from "./common";

/** Why no table of contents was inserted. */
export type TocSkip =
  | "no-title-page"
  | "existing-toc"
  | "toc-heading-present"
  | "too-few-headings"
  | "too-small";

/** Why no section break was inserted after the title page. */
export type TitleBreakSkip =
  | "no-title"
  | "already"
  | "no-section"
  | "title-too-short"
  | "no-heading-after"
  | "toc-guard";

/** Roles that count as the running text a table of contents would index. */
const BODYISH = new Set(["body", "unknown", "list_item", "bibliography_item"]);

/**
 * The student's own contents line. It reaches the classifier either as the
 * `toc` role or, when they gave it a Heading style, as a plain heading whose
 * text happens to be «СОДЕРЖАНИЕ» — the style wins over the text pattern, so
 * the text has to be read here.
 */
const TOC_NAME = /^(?:\d+\.?\s+)?(?:СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ)\s*\.?$/iu;

/**
 * A lone line under the contents heading that is this short is not an entry —
 * a stray page number, a dash. It counts as nothing being listed.
 */
const STRAY_LINE_CHARS = 10;

/** Below this many headings there is nothing worth listing. */
const MIN_HEADINGS = 3;
/** Below this much running text the file is a fragment, not a paper. */
const MIN_BODY = 20;
/** A "title page" shorter than this is one stray line, not a page. */
const MIN_TITLE_PARAGRAPHS = 3;

export interface DocShape {
  /** heading_L1 + heading_L2 + heading_L3, any source. */
  headings: number;
  /** Non-empty, non-table_cell running text. */
  bodyish: number;
  /** Paragraphs that are a typed «СОДЕРЖАНИЕ/ОГЛАВЛЕНИЕ», by role or by text. */
  tocHeadings: number;
  /** The student's own contents line, when there is one to build on. */
  tocHeadingNode?: OrderedXmlNode;
  /** Whether anything is actually listed under that line. */
  tocSectionFilled: boolean;
}

/**
 * Whether the student's «СОДЕРЖАНИЕ» line has anything under it.
 *
 * The region runs from the line to the next real heading. A table there is a
 * hand-drawn contents table; `toc`-role paragraphs are typed entries; anything
 * else counts as a listed line unless it is a single stray short one.
 */
function sectionFilled(list: ClassificationResult["list"], from: number): boolean {
  let lines = 0;
  let longest = 0;
  for (let i = from + 1; i < list.length; i++) {
    const cp = list[i];
    const text = (cp.text ?? "").trim();
    if (cp.role.startsWith("heading_L") && !TOC_NAME.test(text)) break;
    // A table under the heading is the pandoc-style contents block.
    if (cp.role === "table_cell") return true;
    if (cp.role === "empty" || text.length === 0) continue;
    lines += 1;
    longest = Math.max(longest, text.length);
    if (lines > 1) return true;
  }
  return lines === 1 && longest > STRAY_LINE_CHARS;
}

export function docShape(classification: ClassificationResult): DocShape {
  let headings = 0;
  let bodyish = 0;
  let tocHeadings = 0;
  let tocAt = -1;
  const list = classification.list;
  for (let i = 0; i < list.length; i++) {
    const cp = list[i];
    const named = TOC_NAME.test((cp.text ?? "").trim());
    if (cp.role.startsWith("heading_L")) {
      headings += 1;
      if (named) tocHeadings += 1;
    } else if (cp.role === "toc") tocHeadings += 1;
    else if (BODYISH.has(cp.role)) bodyish += 1;
    if (tocAt < 0 && named && (cp.role.startsWith("heading_L") || cp.role === "toc")) tocAt = i;
  }
  return {
    headings,
    bodyish,
    tocHeadings,
    ...(tocAt >= 0 ? { tocHeadingNode: list[tocAt].node } : {}),
    tocSectionFilled: tocAt >= 0 ? sectionFilled(list, tocAt) : false,
  };
}

/**
 * The content half of the TOC contract: (b) the student has no «СОДЕРЖАНИЕ» of
 * their own, (c) there are headings to list, (d) there is a document under
 * them. `existing-toc` is decided in toc.ts, which reads the OOXML itself.
 *
 * This also covers the fragment case — a title-page-only file scans as 0
 * headings and no running text, so it stops at (c) without a rule of its own.
 */
export function tocContentSkip(shape: DocShape): TocSkip | null {
  // A heading with entries under it is the student's own table of contents and
  // stays untouched (D-1/D-6). A heading with nothing under it is a promise
  // they never kept: the field goes in below it, and `insertToc` adds no second
  // heading — see the `tocHeadingNode` path there.
  if (shape.tocHeadings > 0 && (shape.tocSectionFilled || !shape.tocHeadingNode)) {
    return "toc-heading-present";
  }
  if (shape.headings < MIN_HEADINGS) return "too-few-headings";
  if (shape.bodyish < MIN_BODY) return "too-small";
  return null;
}

/** A skip that also means the document is too thin to break into sections. */
export function blocksTitleBreak(skip: TocSkip | null): boolean {
  return skip === "too-small" || skip === "too-few-headings";
}

/** Paragraphs in blocks[0..end] — how much of a title page there actually is. */
export function titleRegionSize(part: MainPart, end: number): number {
  let n = 0;
  for (let i = 0; i <= end && i < part.blocks.length; i++) {
    if ("w:p" in part.blocks[i]) n += 1;
  }
  return n;
}

/** True when some heading sits past `end` — the break would separate something. */
export function headingAfter(
  part: MainPart,
  roles: Map<OrderedXmlNode, string>,
  end: number
): boolean {
  for (let i = end + 1; i < part.blocks.length; i++) {
    const role = roles.get(part.blocks[i]);
    if (role && role.startsWith("heading_L")) return true;
  }
  return false;
}

export { MIN_HEADINGS, MIN_BODY, MIN_TITLE_PARAGRAPHS };
