/**
 * The aux step: everything the restyler must ADD rather than restyle.
 *
 * It runs after restyle and before save. Restyling alone cannot satisfy the
 * checker rules that ask for content the student never wrote — a table of
 * contents, a section break after the title page — so those live here, each
 * behind a named fidelity allowance.
 */

import type { OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { DocxPackage } from "../docx/package";
import type { ClassificationResult } from "../classify/types";
import type { PackSpec } from "../restyle/spec";
import { roleMap } from "./common";
import { insertToc } from "./toc";
import { insertTitleBreak } from "./title-break";
import { normalizeText } from "./text-norm";
import { scaleImages } from "./images";
import { blocksTitleBreak, docShape, tocContentSkip, type TitleBreakSkip, type TocSkip } from "./guards";

export interface AuxStats {
  tocInserted: boolean;
  /** A TOC was already present and left alone. */
  tocExisting: boolean;
  /** The TOC field went under the student's own heading, without adding one. */
  tocUnderExistingHeading: boolean;
  updateFields: boolean;
  titleBreak: boolean;
  spacesCollapsed: number;
  /** Doubled full stops reduced to one (same opt-in as spacesCollapsed). */
  doubleDotsFixed: number;
  /** Drawings shrunk to the text column. */
  imagesScaled: number;
  /** Headings the classifier found (L1+L2+L3) — the TOC guard's main input. */
  headings: number;
  /** Why no TOC was inserted, when none was. */
  tocSkipped?: TocSkip;
  /** Why no section break was inserted after the title page, when none was. */
  titleBreakSkipped?: TitleBreakSkip;
  /** The restyler's own page break before the first block after the section break. */
  redundantBreakRemoved: boolean;
}

export interface AuxOptions {
  /** Collapse space runs and doubled dots in body text. Off by default. */
  textNormalization?: boolean;
  /** Paragraphs the restyler gave a w:pageBreakBefore they did not have. */
  addedPageBreak?: Set<OrderedXmlNode>;
  /** Whether the document already had a TOC, read before the restyle. */
  existingToc?: boolean;
}

export async function runAux(
  pkg: DocxPackage,
  spec: PackSpec,
  classification: ClassificationResult,
  opts: AuxOptions = {}
): Promise<AuxStats> {
  const roles = roleMap(classification);
  const shape = docShape(classification);
  const contentSkip = tocContentSkip(shape);
  // The break goes in first: it edits an existing title paragraph, so it reads
  // body indices that the TOC insertion would otherwise have shifted.
  const brk = await insertTitleBreak(pkg, roles, opts.addedPageBreak, blocksTitleBreak(contentSkip));
  const toc = await insertToc(pkg, spec, roles, opts.existingToc, contentSkip, shape.tocHeadingNode);
  const text = opts.textNormalization
    ? normalizeText(classification)
    : { spacesCollapsed: 0, doubleDotsFixed: 0 };
  if (text.spacesCollapsed > 0 || text.doubleDotsFixed > 0) {
    for (const cp of classification.list) pkg.markDirty(cp.part);
  }

  const imagesScaled = await scaleImages(pkg);

  return {
    tocInserted: toc.inserted,
    tocExisting: toc.existing,
    tocUnderExistingHeading: toc.underExistingHeading === true,
    updateFields: toc.updateFields,
    titleBreak: brk.inserted,
    spacesCollapsed: text.spacesCollapsed,
    doubleDotsFixed: text.doubleDotsFixed,
    imagesScaled,
    headings: shape.headings,
    tocSkipped: toc.skipped,
    ...(brk.skipped ? { titleBreakSkipped: brk.skipped } : {}),
    redundantBreakRemoved: brk.redundantBreakRemoved,
  };
}

export { insertToc, hasExistingToc, detectExistingToc } from "./toc";
export { insertTitleBreak } from "./title-break";
export { normalizeText, type TextNormStats } from "./text-norm";
export { scaleImages } from "./images";
export { docShape, tocContentSkip, type TitleBreakSkip, type TocSkip } from "./guards";
