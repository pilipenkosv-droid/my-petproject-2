/**
 * pipeline-v7 orchestrator — fingerprint, classify, restyle, gate, check.
 *
 * The gate is the contract: unless the fidelity fingerprint of the output
 * matches the input (modulo the A1–A6 allowances), no buffer leaves this
 * function. `returnOnGateFail` exists for the bench only, so a failing run can
 * still be inspected.
 */

import { runQualityChecks } from "@/lib/pipeline-v6/checker";
import { rulesFromPack } from "@/lib/pipeline-v6/orchestrator";
import { resolveRulePack, type RulePack } from "@/lib/pipeline-v6/rule-packs";
import { DocxPackage } from "./docx/package";
import { computeFingerprint } from "./fingerprint/compute";
import { evaluateGate, FidelityGateError, type GateResult } from "./fingerprint/gate";
import { classifyDocument } from "./classify/deterministic";
import { ROLES, type ClassificationResult, type Role } from "./classify/types";
import { emptySink, restyleDocument } from "./restyle";
import { buildPackSpec } from "./restyle/spec";
import { detectExistingToc, runAux } from "./aux";
import {
  EMPTY_AUX,
  classificationReport,
  emptyRestyleStats,
  failedChecks,
  score,
  toDocxParagraphs,
} from "./checker-bridge";
import type { V7Options, V7Report, V7Result } from "./report-types";

/** unknown is restyled as body; the report keeps the original verdict. */
function forRestyle(classification: ClassificationResult): ClassificationResult {
  return {
    ...classification,
    list: classification.list.map((cp) =>
      cp.role === "unknown" ? { ...cp, role: "body" as Role } : cp
    ),
  };
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

  // A suspect classification is a refusal, not a licence to guess: the document
  // goes back byte for byte, which trivially satisfies the fidelity gate.
  if (classification.suspect) {
    return refuse(input, { documentId, pack, classification, gate: evaluateGate(before, before) }, t0, {
      fingerprintBeforeMs,
      classifyMs,
    });
  }

  // Read before the restyle: a TOC is recognised partly by paragraph styles,
  // which the restyle is about to overwrite.
  const existingToc = await detectExistingToc(pkg);

  const t2 = Date.now();
  const styled = forRestyle(classification);
  const sink = emptySink();
  const restyle = await restyleFn(pkg, pack, styled, sink);
  const restyleMs = Date.now() - t2;

  const tAux = Date.now();
  const aux = await runAux(pkg, buildPackSpec(pack), styled, {
    textNormalization: opts.textNormalization,
    addedPageBreak: sink.addedPageBreak,
    existingToc,
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
  const checker = await score(input, output, toDocxParagraphs(classification), documentId, pack);
  const checkerMs = Date.now() - t6;

  const totalMs = Date.now() - t0;
  const report: V7Report = {
    documentId,
    pack: pack.slug,
    classification: classificationReport(classification),
    restyle,
    aux: {
      ...aux,
      tblHeaderSet: restyle.tblHeaderSet,
      underlineRemoved: restyle.underlineRemoved,
    },
    gate,
    checker,
    timings: {
      fingerprintBeforeMs,
      classifyMs,
      restyleMs,
      auxMs,
      saveMs,
      fingerprintAfterMs,
      gateMs,
      checkerMs,
      formatMs: totalMs - checkerMs - fingerprintAfterMs - gateMs,
      totalMs,
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

/** The untouched-document exit: the input is the output and nothing was run. */
async function refuse(
  input: Buffer,
  common: Common,
  t0: number,
  partial: { fingerprintBeforeMs: number; classifyMs: number }
): Promise<V7Result> {
  const t6 = Date.now();
  const rules = rulesFromPack(common.pack);
  const source = await runQualityChecks(input, input, undefined, common.documentId, rules);
  const checkerMs = Date.now() - t6;
  const totalMs = Date.now() - t0;
  return {
    output: input,
    report: {
      documentId: common.documentId,
      pack: common.pack.slug,
      classification: classificationReport(common.classification),
      restyle: emptyRestyleStats(),
      aux: EMPTY_AUX,
      gate: common.gate,
      refused: "classification_suspect",
      checker: {
        sourceScore: source.score,
        finalScoreUndef: source.score,
        finalScoreRoles: source.score,
        finalScore: source.score,
        failed: failedChecks(source),
      },
      timings: {
        ...partial,
        restyleMs: 0,
        auxMs: 0,
        saveMs: 0,
        fingerprintAfterMs: 0,
        gateMs: 0,
        checkerMs,
        formatMs: totalMs - checkerMs,
        totalMs,
      },
    },
  };
}

/** The report fields that describe the run itself, shared by both exits. */
interface Common {
  documentId: string;
  pack: RulePack;
  classification: ClassificationResult;
  gate: GateResult;
}

export { ROLE_TO_BLOCK_TYPE } from "./checker-bridge";
export { ROLES };
export type { V7Options, V7Report, V7Result } from "./report-types";
