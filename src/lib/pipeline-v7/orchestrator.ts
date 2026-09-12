/**
 * pipeline-v7 orchestrator — fingerprint, classify, restyle, gate, check.
 *
 * The gate is the contract: unless the fidelity fingerprint of the output
 * matches the input (modulo the A1–A6 allowances), no buffer leaves this
 * function. `returnOnGateFail` exists for the bench only, so a failing run can
 * still be inspected.
 */

import { runQualityChecks, type QualityReport } from "@/lib/pipeline-v6/checker";
import { rulesFromPack } from "@/lib/pipeline-v6/orchestrator";
import { resolveRulePack, type RulePack } from "@/lib/pipeline-v6/rule-packs";
import type { BlockType } from "@/lib/ai/block-markup-schemas";
import type { DocxParagraph } from "@/lib/pipeline/document-analyzer";
import { DocxPackage } from "./docx/package";
import { computeFingerprint } from "./fingerprint/compute";
import { evaluateGate, FidelityGateError, type GateResult } from "./fingerprint/gate";
import { classifyDocument } from "./classify/deterministic";
import { candidatesForLlm } from "./classify/llm-candidates";
import { ROLES, type ClassificationResult, type ClassifySource, type Role } from "./classify/types";
import { restyleDocument, type RestyleStats } from "./restyle";
import { buildPackSpec } from "./restyle/spec";
import { runAux, type AuxStats } from "./aux";

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

export interface V7Options {
  /** Rule pack or its slug. Default: the registry default (ГОСТ 7.32). */
  pack?: RulePack;
  packSlug?: string;
  documentId?: string;
  /** Residue layer hook. Owned by classify/llm.ts — not implemented here. */
  llm?: (classification: ClassificationResult) => Promise<ClassificationResult>;
  /** Bench only: return the report with `output: undefined` instead of throwing. */
  returnOnGateFail?: boolean;
  /** Test seam: replace the restyle step. */
  restyleImpl?: typeof restyleDocument;
  /** Collapse runs of spaces in body text (the only text mutation). Off by default. */
  textNormalization?: boolean;
}

export interface V7Report {
  documentId: string;
  pack: string;
  classification: {
    histogram: Record<Role, number>;
    sources: Record<string, number>;
    suspect: boolean;
    warnings: string[];
    lowConfidence: { path: string; part: string; role: Role; confidence: number }[];
  };
  restyle: RestyleStats;
  aux: AuxStats & { tblHeaderSet: number; underlineRemoved: number };
  gate: GateResult;
  checker: { sourceScore: number; finalScore: number; failed: string[] };
  timings: {
    fingerprintBeforeMs: number;
    classifyMs: number;
    restyleMs: number;
    auxMs: number;
    saveMs: number;
    fingerprintAfterMs: number;
    gateMs: number;
    checkerMs: number;
    totalMs: number;
  };
}

export interface V7Result {
  output?: Buffer;
  report: V7Report;
}

function sourceHistogram(list: { source: ClassifySource }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cp of list) out[cp.source] = (out[cp.source] ?? 0) + 1;
  return out;
}

/** unknown is restyled as body; the report keeps the original verdict. */
function forRestyle(classification: ClassificationResult): ClassificationResult {
  return {
    ...classification,
    list: classification.list.map((cp) =>
      cp.role === "unknown" ? { ...cp, role: "body" as Role } : cp
    ),
  };
}

/** Synthesised enriched paragraphs for the v6 checker — roles only, no properties. */
function toDocxParagraphs(classification: ClassificationResult): DocxParagraph[] {
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

function failedChecks(report: QualityReport): string[] {
  return report.checks.filter((c) => !c.passed).map((c) => c.id);
}

export async function runPipelineV7(input: Buffer, opts: V7Options = {}): Promise<V7Result> {
  const pack = opts.pack ?? resolveRulePack(opts.packSlug);
  const documentId = opts.documentId ?? "v7";
  const restyleFn = opts.restyleImpl ?? restyleDocument;
  const t0 = Date.now();

  const before = await computeFingerprint(input);
  const fingerprintBeforeMs = Date.now() - t0;

  const t1 = Date.now();
  const pkg = await DocxPackage.load(input);
  let classification = await classifyDocument(pkg);
  if (opts.llm) classification = await opts.llm(classification);
  const classifyMs = Date.now() - t1;

  const t2 = Date.now();
  const styled = forRestyle(classification);
  const restyle = await restyleFn(pkg, pack, styled);
  const restyleMs = Date.now() - t2;

  const tAux = Date.now();
  const aux = await runAux(pkg, buildPackSpec(pack), styled, {
    textNormalization: opts.textNormalization,
  });
  const auxMs = Date.now() - tAux;

  const t3 = Date.now();
  const output = await pkg.save();
  const saveMs = Date.now() - t3;

  const t4 = Date.now();
  const after = await computeFingerprint(output);
  const fingerprintAfterMs = Date.now() - t4;

  const t5 = Date.now();
  const gate = evaluateGate(before, after, {
    allowTextNormalization: opts.textNormalization === true,
  });
  const gateMs = Date.now() - t5;

  const t6 = Date.now();
  const enriched = toDocxParagraphs(classification);
  const rules = rulesFromPack(pack);
  const sourceReport = await runQualityChecks(input, input, enriched, documentId, rules);
  const finalReport = await runQualityChecks(input, output, enriched, documentId, rules);
  const checkerMs = Date.now() - t6;

  const report: V7Report = {
    documentId,
    pack: pack.slug,
    classification: {
      histogram: classification.histogram,
      sources: sourceHistogram(classification.list),
      suspect: classification.suspect,
      warnings: classification.warnings,
      lowConfidence: candidatesForLlm(classification).map((cp) => ({
        path: cp.path,
        part: cp.part,
        role: cp.role,
        confidence: cp.confidence,
      })),
    },
    restyle,
    aux: {
      ...aux,
      tblHeaderSet: restyle.tblHeaderSet,
      underlineRemoved: restyle.underlineRemoved,
    },
    gate,
    checker: {
      sourceScore: sourceReport.score,
      finalScore: finalReport.score,
      failed: failedChecks(finalReport),
    },
    timings: {
      fingerprintBeforeMs,
      classifyMs,
      restyleMs,
      auxMs,
      saveMs,
      fingerprintAfterMs,
      gateMs,
      checkerMs,
      totalMs: Date.now() - t0,
    },
  };

  if (!gate.pass) {
    if (!opts.returnOnGateFail) {
      throw new FidelityGateError(
        `v7: гейт верности не пройден (${gate.violations.length} нарушений)`,
        gate.diff
      );
    }
    return { report };
  }
  return { output, report };
}

export { ROLES };
