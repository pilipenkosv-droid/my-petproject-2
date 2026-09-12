/**
 * The shape of a pipeline-v7 run: what it is asked for and what it reports.
 *
 * Separate from the orchestrator so the checker bridge can name the report's
 * fields without importing the function that fills them.
 */

import type { RulePack } from "@/lib/pipeline-v6/rule-packs";
import type { GateResult } from "./fingerprint/gate";
import type { ClassificationResult, Role } from "./classify/types";
import type { restyleDocument, RestyleStats } from "./restyle";
import type { AuxStats } from "./aux";

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
  /**
   * The document was returned untouched. Set when the classifier itself said it
   * could not read the structure: restyling on a classification that is known
   * to be wrong damages more than it fixes.
   */
  refused?: "classification_suspect";
  checker: {
    sourceScore: number;
    /**
     * The v6 checker over the output with no paragraph roles supplied — what
     * production actually sees, and the only score comparable to v6's own.
     */
    finalScoreUndef: number;
    /** The same checker told v7's roles. Higher, and not comparable to v6. */
    finalScoreRoles: number;
    /** Alias of finalScoreUndef, kept so existing readers do not silently shift. */
    finalScore: number;
    failed: string[];
  };
  timings: {
    fingerprintBeforeMs: number;
    classifyMs: number;
    restyleMs: number;
    auxMs: number;
    saveMs: number;
    fingerprintAfterMs: number;
    gateMs: number;
    checkerMs: number;
    /** Total minus everything that only exists to measure the run. */
    formatMs: number;
    totalMs: number;
  };
}

export interface V7Result {
  output?: Buffer;
  report: V7Report;
}
