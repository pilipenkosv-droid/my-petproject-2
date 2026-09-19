/**
 * Everything the v7 pipeline has to say in the v6 checker's vocabulary, plus
 * the empty shapes a refused run reports.
 *
 * It lives apart from the orchestrator because it is the only place where v7's
 * role names, the checker's BlockType names and the report's field names meet;
 * keeping the translation in one file is what stops a role from being renamed
 * on one side only.
 */

import { runQualityChecks, type QualityReport } from "@/lib/pipeline-v6/checker";
import { rulesFromPack } from "@/lib/pipeline-v6/orchestrator";
import type { RulePack } from "@/lib/pipeline-v6/rule-packs";
import type { BlockType } from "@/lib/ai/block-markup-schemas";
import type { DocxParagraph } from "@/lib/pipeline/document-analyzer";
import { candidatesForLlm } from "./classify/llm-candidates";
import { emptyHistogram, type ClassificationResult, type Role } from "./classify/types";
import type { RestyleStats } from "./restyle";
import type { V7Report } from "./report-types";

const DOCUMENT_PART = "word/document.xml";

/** v7 role → the v6 checker's BlockType vocabulary. Total over Role. */
export const ROLE_TO_BLOCK_TYPE: Record<Role, BlockType> = {
  title_page: "title_page",
  toc: "toc_entry",
  heading_L1: "heading_1",
  heading_L2: "heading_2",
  heading_L3: "heading_3",
  body: "body_text",
  list_item: "list_item",
  table_cell: "table",
  figure_caption: "figure_caption",
  table_caption: "table_caption",
  formula: "formula",
  bibliography_item: "bibliography_entry",
  appendix_heading: "appendix_title",
  note: "footnote",
  header_footer: "page_number",
  empty: "empty",
  unknown: "unknown",
};

/** Synthesised enriched paragraphs for the v6 checker — roles only, no properties. */
export function toDocxParagraphs(classification: ClassificationResult): DocxParagraph[] {
  const out: DocxParagraph[] = [];
  for (const cp of classification.list) {
    if (cp.part !== DOCUMENT_PART) continue;
    out.push({
      index: out.length,
      text: cp.text ?? "",
      blockType: ROLE_TO_BLOCK_TYPE[cp.role],
      properties: {},
    });
  }
  return out;
}

export function failedChecks(report: QualityReport): string[] {
  return report.checks.filter((c) => !c.passed).map((c) => c.id);
}

/**
 * The v6 checker, twice over the output: once blind, once told v7's roles.
 *
 * The blind run is what production sees, and the only number comparable to
 * another pipeline's score — a checker handed the roles no longer has to guess
 * which paragraph is a heading, and scores accordingly. Reporting only that one
 * would credit v7 for work the comparison does not include.
 */
export async function score(
  input: Buffer,
  output: Buffer,
  enriched: DocxParagraph[],
  documentId: string,
  pack: RulePack
): Promise<V7Report["checker"]> {
  const rules = rulesFromPack(pack);
  const source = await runQualityChecks(input, input, undefined, documentId, rules);
  const undef = await runQualityChecks(input, output, undefined, documentId, rules);
  const roles = await runQualityChecks(input, output, enriched, documentId, rules);
  return {
    sourceScore: source.score,
    finalScoreUndef: undef.score,
    finalScoreRoles: roles.score,
    finalScore: undef.score,
    failed: failedChecks(undef),
  };
}

function sourceHistogram(list: { source: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cp of list) out[cp.source] = (out[cp.source] ?? 0) + 1;
  return out;
}

export function classificationReport(c: ClassificationResult): V7Report["classification"] {
  return {
    histogram: c.histogram,
    sources: sourceHistogram(c.list),
    suspect: c.suspect,
    warnings: c.warnings,
    lowConfidence: candidatesForLlm(c).map((cp) => ({
      path: cp.path,
      part: cp.part,
      role: cp.role,
      confidence: cp.confidence,
    })),
  };
}

/** What the restyle stats look like when the restyler never ran. */
export function emptyRestyleStats(): RestyleStats {
  return {
    paragraphsTouched: 0,
    runsTouched: 0,
    sectionsTouched: 0,
    stylesUpserted: 0,
    tblHeaderSet: 0,
    underlineRemoved: 0,
    byRole: emptyHistogram(),
    stylesPartMissing: false,
  };
}

/** The same, for the aux step. */
export const EMPTY_AUX: V7Report["aux"] = {
  tocInserted: false,
  tocExisting: false,
  updateFields: false,
  titleBreak: false,
  spacesCollapsed: 0,
  doubleDotsFixed: 0,
  headings: 0,
  redundantBreakRemoved: false,
  tblHeaderSet: 0,
  underlineRemoved: 0,
};
