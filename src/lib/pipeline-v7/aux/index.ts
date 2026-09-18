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
import { normalizeSpaces } from "./text-norm";
import { blocksTitleBreak, docShape, tocContentSkip, type TitleBreakSkip, type TocSkip } from "./guards";

export interface AuxStats {
  tocInserted: boolean;
  /** A TOC was already present and left alone. */
  tocExisting: boolean;
  updateFields: boolean;
  titleBreak: boolean;
  spacesCollapsed: number;
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
  /** Collapse runs of spaces in body text. Off by default. */
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
  const toc = await insertToc(pkg, spec, roles, opts.existingToc, contentSkip);
  const spacesCollapsed = opts.textNormalization ? normalizeSpaces(classification) : 0;
  if (spacesCollapsed > 0) for (const cp of classification.list) pkg.markDirty(cp.part);

  return {
    tocInserted: toc.inserted,
    tocExisting: toc.existing,
    updateFields: toc.updateFields,
    titleBreak: brk.inserted,
    spacesCollapsed,
    headings: shape.headings,
    tocSkipped: toc.skipped,
    ...(brk.skipped ? { titleBreakSkipped: brk.skipped } : {}),
    redundantBreakRemoved: brk.redundantBreakRemoved,
  };
}

export { insertToc, hasExistingToc, detectExistingToc } from "./toc";
export { insertTitleBreak } from "./title-break";
export { normalizeSpaces } from "./text-norm";
export { docShape, tocContentSkip, type TitleBreakSkip, type TocSkip } from "./guards";
