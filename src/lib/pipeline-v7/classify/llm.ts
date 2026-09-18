/**
 * T1 — the LLM residue layer.
 *
 * It never sees the whole document: only the candidate lines T0 left unproven,
 * in batches, under a hard request budget and a wall-clock deadline. Every
 * failure mode — model down, quota gone, timeout, garbage JSON — is a
 * degradation, not an error: the caller keeps its T0 roles and is told the
 * layer degraded. A classifier that throws would make the pipeline worse than
 * having no LLM at all.
 */

import { callAI } from "@/lib/ai/gateway";
import { buildUserPrompt, SYSTEM_PROMPT, type CandidateView } from "./prompt";
import { roleBatchSchema, type RoleAssignment } from "./schema";
import { candidatesForLlm } from "./llm-candidates";
import type { ClassificationResult, ClassifiedParagraph } from "./types";

export interface LlmResidueOptions {
  maxCandidates?: number;
  batchSize?: number;
  maxConcurrency?: number;
  maxRequests?: number;
  perRequestTimeoutMs?: number;
  totalBudgetMs?: number;
}

const DEFAULTS = {
  maxCandidates: 600,
  batchSize: 80,
  maxConcurrency: 3,
  maxRequests: 8,
  perRequestTimeoutMs: 20000,
  totalBudgetMs: 45000,
} satisfies Required<LlmResidueOptions>;

/** One batch and whatever the model managed to say about it. */
export interface LlmBatchOutcome {
  items: ClassifiedParagraph[];
  assignments: RoleAssignment[];
}

export interface LlmResidueResult {
  batches: LlmBatchOutcome[];
  /** Candidates T0 handed over, before the cap. */
  candidates: number;
  /** Requests actually sent (successful or not). */
  requests: number;
  /** Candidates never submitted: over the cap or past the request budget. */
  skipped: number;
  skippedPaths: string[];
  degraded: boolean;
  ms: number;
  errors: string[];
}

const TEXT_LEN = 160;
const LEADING_NUMBER_RE = /^\d+(?:\.\d+)*\.?\s/u;

/** Cheap ordering so the cap keeps the lines most likely to be structural. */
function interestScore(cp: ClassifiedParagraph, nextIsEmpty: boolean): number {
  const f = cp.features;
  const len = (cp.text ?? "").length;
  return (
    (f?.boldAll ? 2 : 0) +
    (f && f.capsRatio >= 0.8 ? 2 : 0) +
    (len > 0 && len <= 80 ? 1 : 0) +
    (nextIsEmpty ? 1 : 0)
  );
}

function buildView(
  cp: ClassifiedParagraph,
  i: number,
  prev: ClassifiedParagraph | undefined,
  next: ClassifiedParagraph | undefined,
  modalSize: number | undefined,
): CandidateView {
  const f = cp.features;
  const text = cp.text ?? "";
  const sz = f?.sz;
  return {
    i,
    text: text.slice(0, TEXT_LEN),
    bold: f?.boldAll ?? false,
    capsRatio: Number((f?.capsRatio ?? 0).toFixed(2)),
    centered: f?.jc === "center",
    sizeDelta: sz !== undefined && modalSize !== undefined ? sz - modalSize : 0,
    prevRole: prev?.role ?? "none",
    nextIsEmpty: next?.role === "empty" && next.part === cp.part,
    startsNumbered: LEADING_NUMBER_RE.test(text),
  };
}

interface Selection {
  picked: ClassifiedParagraph[];
  skippedPaths: string[];
}

/** Apply the candidate cap, keeping document order among the survivors. */
function selectCandidates(
  candidates: ClassifiedParagraph[],
  nextIsEmpty: (cp: ClassifiedParagraph) => boolean,
  cap: number,
): Selection {
  if (candidates.length <= cap) return { picked: candidates, skippedPaths: [] };
  const ranked = candidates
    .map((cp, order) => ({ cp, order, score: interestScore(cp, nextIsEmpty(cp)) }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const keep = new Set(ranked.slice(0, cap).map((r) => r.order));
  const picked: ClassifiedParagraph[] = [];
  const skippedPaths: string[] = [];
  candidates.forEach((cp, order) => {
    if (keep.has(order)) picked.push(cp);
    else skippedPaths.push(cp.path);
  });
  return { picked, skippedPaths };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`llm residue timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function askBatch(views: CandidateView[], timeoutMs: number): Promise<RoleAssignment[]> {
  const response = await withDeadline(
    callAI({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(views),
      temperature: 0,
      maxTokens: 4096,
      thinking: false, // классификация остатка — извлечение
    }),
    timeoutMs,
  );
  return roleBatchSchema.parse(response.json).assignments;
}

interface RunState {
  outcomes: LlmBatchOutcome[];
  requests: number;
  errors: string[];
  skippedPaths: string[];
}

/** Worker pool over the batch queue; every worker respects the shared deadline. */
async function runBatches(
  batches: ClassifiedParagraph[][],
  views: CandidateView[][],
  opts: Required<LlmResidueOptions>,
  deadline: number,
  state: RunState,
): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = cursor++;
      if (idx >= batches.length) return;
      const left = deadline - Date.now();
      if (left <= 0) {
        for (const cp of batches[idx]) state.skippedPaths.push(cp.path);
        state.errors.push(`batch ${idx}: budget exhausted`);
        continue;
      }
      state.requests += 1;
      try {
        const assignments = await askBatch(views[idx], Math.min(opts.perRequestTimeoutMs, left));
        state.outcomes.push({ items: batches[idx], assignments });
      } catch (err) {
        state.errors.push(`batch ${idx}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(opts.maxConcurrency, batches.length) }, worker),
  );
}

export async function classifyResidueWithLlm(
  classification: ClassificationResult,
  options: LlmResidueOptions = {},
): Promise<LlmResidueResult> {
  const opts: Required<LlmResidueOptions> = { ...DEFAULTS };
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "number") (opts as Record<string, number>)[key] = value;
  }
  const started = Date.now();
  const candidates = candidatesForLlm(classification);
  const index = new Map<ClassifiedParagraph, number>();
  classification.list.forEach((cp, i) => index.set(cp, i));
  const at = (cp: ClassifiedParagraph, delta: number) =>
    classification.list[(index.get(cp) ?? -1) + delta];
  const nextIsEmpty = (cp: ClassifiedParagraph) => at(cp, 1)?.role === "empty";

  const { picked, skippedPaths } = selectCandidates(candidates, nextIsEmpty, opts.maxCandidates);
  const allBatches = chunk(picked, opts.batchSize);
  const batches = allBatches.slice(0, opts.maxRequests);
  const state: RunState = { outcomes: [], requests: 0, errors: [], skippedPaths };
  for (const over of allBatches.slice(opts.maxRequests)) {
    for (const cp of over) state.skippedPaths.push(cp.path);
    state.errors.push("request budget exhausted");
  }

  if (batches.length > 0) {
    const views = batches.map((batch) =>
      batch.map((cp, i) =>
        buildView(cp, i, at(cp, -1), at(cp, 1), classification.modalBodySize),
      ),
    );
    await runBatches(batches, views, opts, started + opts.totalBudgetMs, state);
  }

  return {
    batches: state.outcomes,
    candidates: candidates.length,
    requests: state.requests,
    skipped: state.skippedPaths.length,
    skippedPaths: state.skippedPaths,
    degraded: state.errors.length > 0,
    ms: Date.now() - started,
    errors: state.errors,
  };
}
