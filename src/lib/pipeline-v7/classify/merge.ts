/**
 * Merging the model's answers back into the T0 verdict.
 *
 * T0 keeps the last word wherever it had real evidence: an index the model
 * invented is dropped, a second opinion on the same line is ignored, a shaky
 * answer leaves the T0 role alone, and a paragraph T0 already resolved at
 * ≥ 0.85 is never overwritten. Whatever survives goes through the same
 * coherence and suspect passes T0 runs, so an LLM cannot smuggle in a document
 * shape the deterministic layer would have rejected.
 */

import { applyCoherence, applySuspect } from "./passes";
import { classifyResidueWithLlm, type LlmResidueOptions, type LlmResidueResult } from "./llm";
import {
  emptyHistogram,
  type ClassificationResult,
  type ClassifiedParagraph,
  type Role,
} from "./types";

const MIN_CONFIDENCE = 0.7;
const T0_WINS_AT = 0.85;
const NOTE_TEXT_LEN = 80;

export interface LowConfidenceNote {
  path: string;
  text: string;
  role: Role;
  confidence: number;
}

export interface LlmStats {
  requests: number;
  candidates: number;
  /** Assignments that actually changed a role. */
  assigned: number;
  skipped: number;
  degraded: boolean;
  ms: number;
}

export interface ClassificationWithLlm extends ClassificationResult {
  llm: LlmStats;
  lowConfidence: LowConfidenceNote[];
}

interface MergeState {
  assigned: number;
  lowConfidence: LowConfidenceNote[];
  warnings: string[];
}

function applyOne(cp: ClassifiedParagraph, role: Role, confidence: number, s: MergeState): void {
  cp.llm = { role, confidence };
  if (cp.role !== "unknown" && cp.confidence >= T0_WINS_AT) {
    s.warnings.push(`llm: ${cp.path} ignored (T0 ${cp.role} @ ${cp.confidence})`);
    return;
  }
  if (confidence < MIN_CONFIDENCE) {
    s.lowConfidence.push({
      path: cp.path,
      text: (cp.text ?? "").slice(0, NOTE_TEXT_LEN),
      role,
      confidence,
    });
    return;
  }
  if (role === "unknown") return;
  cp.role = role;
  cp.confidence = confidence;
  cp.source = "llm";
  s.assigned += 1;
}

function mergeBatch(
  items: ClassifiedParagraph[],
  assignments: { i: number; role: Role; confidence: number }[],
  s: MergeState,
): void {
  const seen = new Set<number>();
  for (const a of assignments) {
    if (a.i < 0 || a.i >= items.length) {
      s.warnings.push(`llm: dropped out-of-range index ${a.i}`);
      continue;
    }
    if (seen.has(a.i)) {
      s.warnings.push(`llm: dropped duplicate index ${a.i}`);
      continue;
    }
    seen.add(a.i);
    applyOne(items[a.i], a.role, a.confidence, s);
  }
}

/**
 * Folds the residue result into a fresh ClassificationResult. The paragraph
 * objects are shared with the input on purpose — `byNode` points at them, and
 * the orchestrator expects the same identities downstream.
 */
export function mergeLlmRoles(
  classification: ClassificationResult,
  residue: LlmResidueResult,
): ClassificationWithLlm {
  const warnings = [...classification.warnings];
  const state: MergeState = { assigned: 0, lowConfidence: [], warnings };
  for (const batch of residue.batches) mergeBatch(batch.items, batch.assignments, state);

  applyCoherence(classification.list, warnings);
  const suspect = applySuspect(classification.list, warnings);
  if (residue.degraded) {
    warnings.push(`llm: degraded — ${residue.errors.slice(0, 3).join("; ")}`);
  }

  const histogram = emptyHistogram();
  for (const cp of classification.list) histogram[cp.role] += 1;

  return {
    byNode: classification.byNode,
    list: classification.list,
    histogram,
    warnings,
    suspect: classification.suspect || suspect,
    modalBodySize: classification.modalBodySize,
    lowConfidence: state.lowConfidence,
    llm: {
      requests: residue.requests,
      candidates: residue.candidates,
      assigned: state.assigned,
      skipped: residue.skipped,
      degraded: residue.degraded,
      ms: residue.ms,
    },
  };
}

/** The hook the orchestrator calls: `opts.llm?.(classification)`. */
export function makeLlmHook(
  options: LlmResidueOptions = {},
): (classification: ClassificationResult) => Promise<ClassificationResult> {
  return async (classification) => {
    const residue = await classifyResidueWithLlm(classification, options);
    return mergeLlmRoles(classification, residue);
  };
}
