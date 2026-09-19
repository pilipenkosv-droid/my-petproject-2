/**
 * Task A of the model-bench (branch w38/26-model-bench): paragraph role
 * classification. Picks the 15 real docs with the most T0 `unknown` roles,
 * sends the v7 LLM-residue batch (candidatesForLlm, ≤80) plus ~20 hidden
 * high-confidence controls per doc to 5 models via the Vercel AI Gateway.
 * Never prints paragraph text — only ids, counts, timings, accuracy.
 *
 *   npx tsx scripts/pipeline-v7/bench-task-a.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import { candidatesForLlm } from "@/lib/pipeline-v7/classify/llm-candidates";
import { buildUserPrompt, SYSTEM_PROMPT, type CandidateView } from "@/lib/pipeline-v7/classify/prompt";
import { roleBatchSchema, roleEnum } from "@/lib/pipeline-v7/classify/schema";
import type { ClassifiedParagraph, ClassificationResult, Role } from "@/lib/pipeline-v7/classify/types";
import { callGatewayModel, tryParseJson, percentile } from "./bench-gateway";

const REAL_DIR = "data/corpus/real";
const N_DOCS = 15;
const MAX_CANDIDATES = 80;
const MAX_CONTROLS = 20;
const CONTROL_CONFIDENCE = 0.85;

/**
 * Control pool must be limited to roles the LLM can actually emit
 * (`roleEnum` minus `unknown`). T0 also assigns `table_cell`, `note`,
 * `header_footer`, `formula` and `empty` with confidence 1 (see
 * `classify/deterministic.ts` `byPosition`/`byMath`), but none of those are
 * in `roleEnum` (`classify/schema.ts`) — the model is never offered them, so
 * including them in the control pool made most "controls" unanswerable by
 * construction. That is the root cause of the 26-34% control accuracy in
 * the 2026-09-18 run (see docs/bench/2026-09-18-model-bench.md, part 2).
 */
const CONTROLLABLE_ROLES: ReadonlySet<Role> = new Set(
  roleEnum.options.filter((r) => r !== "unknown") as Role[]
);

const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4.1-nano",
  "openai/gpt-4.1-mini",
  "deepseek/deepseek-v3.2",
];
const BASELINE_MODEL = "google/gemini-2.5-flash";

const TEXT_LEN = 160;
const LEADING_NUMBER_RE = /^\d+(?:\.\d+)*\.?\s/u;

function buildView(
  cp: ClassifiedParagraph,
  i: number,
  prev: ClassifiedParagraph | undefined,
  next: ClassifiedParagraph | undefined,
  modalSize: number | undefined
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

interface DocSelection {
  file: string;
  unknownCount: number;
  result: ClassificationResult;
  batch: ClassifiedParagraph[];
  controlIndices: Set<number>; // index within `batch`
}

async function selectDocs(): Promise<DocSelection[]> {
  const files = readdirSync(REAL_DIR).filter((f) => f.endsWith(".docx"));
  const ranked: Array<{ file: string; unknownCount: number; result: ClassificationResult }> = [];

  for (const file of files) {
    const pkg = await DocxPackage.load(readFileSync(join(REAL_DIR, file)));
    const result = await classifyDocument(pkg);
    ranked.push({ file, unknownCount: result.histogram.unknown ?? 0, result });
  }
  ranked.sort((a, b) => b.unknownCount - a.unknownCount);
  const top = ranked.slice(0, N_DOCS);

  return top.map(({ file, unknownCount, result }) => {
    const index = new Map<ClassifiedParagraph, number>();
    result.list.forEach((cp, i) => index.set(cp, i));
    const at = (cp: ClassifiedParagraph, delta: number) => result.list[(index.get(cp) ?? -1) + delta];

    const candidates = candidatesForLlm(result).slice(0, MAX_CANDIDATES);
    const candidateSet = new Set(candidates);

    const controlPool = result.list.filter(
      (cp) =>
        CONTROLLABLE_ROLES.has(cp.role) &&
        cp.confidence >= CONTROL_CONFIDENCE &&
        !candidateSet.has(cp) &&
        (cp.text ?? "").trim().length > 0
    );
    // Deterministic spread across the doc rather than the first N lines.
    const step = Math.max(1, Math.floor(controlPool.length / MAX_CONTROLS));
    const controls: ClassifiedParagraph[] = [];
    for (let i = 0; i < controlPool.length && controls.length < MAX_CONTROLS; i += step) {
      controls.push(controlPool[i]);
    }

    const batch = [...candidates, ...controls];
    const controlIndices = new Set(controls.map((_, i) => candidates.length + i));

    return { file, unknownCount, result, batch, controlIndices };
  });
}

interface ModelDocStat {
  ok: boolean;
  jsonParseFailed: boolean;
  durationMs: number;
  costUSD: number;
  assignedRoles: Map<number, string>; // batch index -> role
}

async function callModelOnDoc(model: string, doc: DocSelection): Promise<ModelDocStat> {
  const index = new Map<ClassifiedParagraph, number>();
  doc.result.list.forEach((cp, i) => index.set(cp, i));
  const at = (cp: ClassifiedParagraph, delta: number) => doc.result.list[(index.get(cp) ?? -1) + delta];
  const views = doc.batch.map((cp, i) => buildView(cp, i, at(cp, -1), at(cp, 1), doc.result.modalBodySize));

  try {
    const res = await callGatewayModel(model, SYSTEM_PROMPT, buildUserPrompt(views), 4096);
    const parsed = tryParseJson(res.text);
    if (!parsed.ok) {
      return { ok: false, jsonParseFailed: true, durationMs: res.durationMs, costUSD: res.costUSD, assignedRoles: new Map() };
    }
    const validated = roleBatchSchema.safeParse(parsed.value);
    if (!validated.success) {
      return { ok: false, jsonParseFailed: true, durationMs: res.durationMs, costUSD: res.costUSD, assignedRoles: new Map() };
    }
    const assignedRoles = new Map<number, string>();
    for (const a of validated.data.assignments) assignedRoles.set(a.i, a.role);
    return { ok: true, jsonParseFailed: false, durationMs: res.durationMs, costUSD: res.costUSD, assignedRoles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("BUDGET_STOP") || msg.startsWith("BUDGET_HARD_CAP")) throw err;
    console.error(`[task-a] ${model} on ${basename(doc.file)}: ${msg}`);
    return { ok: false, jsonParseFailed: false, durationMs: 0, costUSD: 0, assignedRoles: new Map() };
  }
}

interface ModelAgg {
  model: string;
  calls: number;
  failures: number;
  jsonParseFailures: number;
  controlCorrect: number;
  controlTotal: number;
  agreeWithBaseline: number;
  agreeTotal: number;
  unknownCount: number;
  itemsTotal: number;
  durations: number[];
  totalCostUSD: number;
  docsCovered: number;
  /** Control-only confusion matrix: "expected|got" -> count. */
  confusion: Map<string, number>;
}

async function main(): Promise<void> {
  console.log("Selecting 15 real docs with the most T0 `unknown` roles (no LLM calls yet)...");
  const docs = await selectDocs();
  for (const d of docs) console.log(`  ${basename(d.file)}: unknown=${d.unknownCount} batchSize=${d.batch.length} controls=${d.controlIndices.size}`);

  const perModel: Record<string, ModelAgg> = {};
  for (const m of MODELS) {
    perModel[m] = {
      model: m,
      calls: 0,
      failures: 0,
      jsonParseFailures: 0,
      controlCorrect: 0,
      controlTotal: 0,
      agreeWithBaseline: 0,
      agreeTotal: 0,
      unknownCount: 0,
      itemsTotal: 0,
      durations: [],
      totalCostUSD: 0,
      docsCovered: 0,
      confusion: new Map(),
    };
  }

  const baselineByDoc: Map<string, Map<number, string>> = new Map();

  let stopped = false;
  for (const doc of docs) {
    if (stopped) break;
    // Fire the 5 models concurrently per doc to keep total wall time low.
    const settled = await Promise.allSettled(MODELS.map((model) => callModelOnDoc(model, doc)));
    const perModelResult: Map<string, ModelDocStat> = new Map();
    for (let mi = 0; mi < MODELS.length; mi++) {
      const model = MODELS[mi];
      const res = settled[mi];
      if (res.status === "rejected") {
        const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
        if (msg.startsWith("BUDGET_STOP") || msg.startsWith("BUDGET_HARD_CAP")) {
          console.error(`STOP: ${msg}`);
          stopped = true;
        }
        continue;
      }
      const stat = res.value;
      perModelResult.set(model, stat);
      const agg = perModel[model];
      agg.calls++;
      agg.docsCovered++;
      agg.durations.push(stat.durationMs);
      agg.totalCostUSD += stat.costUSD;
      if (!stat.ok) {
        agg.failures++;
        if (stat.jsonParseFailed) agg.jsonParseFailures++;
        continue;
      }
      for (const [, role] of stat.assignedRoles) {
        agg.itemsTotal++;
        if (role === "unknown") agg.unknownCount++;
      }
      for (const idx of doc.controlIndices) {
        const expected = doc.batch[idx].role;
        const got = stat.assignedRoles.get(idx);
        if (got !== undefined) {
          agg.controlTotal++;
          if (got === expected) agg.controlCorrect++;
          const key = `${expected}|${got}`;
          agg.confusion.set(key, (agg.confusion.get(key) ?? 0) + 1);
        }
      }
      if (model === BASELINE_MODEL) baselineByDoc.set(doc.file, stat.assignedRoles);
    }
    if (stopped) break;
    const baseline = baselineByDoc.get(doc.file);
    if (baseline) {
      for (const model of MODELS) {
        if (model === BASELINE_MODEL) continue;
        const stat = perModelResult.get(model);
        if (!stat || !stat.ok) continue;
        for (const [idx, role] of stat.assignedRoles) {
          const baseRole = baseline.get(idx);
          if (baseRole === undefined) continue;
          perModel[model].agreeTotal++;
          if (baseRole === role) perModel[model].agreeWithBaseline++;
        }
      }
    }
  }

  console.log("\n=== Task A summary ===");
  const rows: Array<Record<string, unknown>> = [];
  for (const model of MODELS) {
    const a = perModel[model];
    const controlAcc = a.controlTotal ? (a.controlCorrect / a.controlTotal) * 100 : null;
    const agreement = a.agreeTotal ? (a.agreeWithBaseline / a.agreeTotal) * 100 : model === BASELINE_MODEL ? 100 : null;
    const unknownShare = a.itemsTotal ? (a.unknownCount / a.itemsTotal) * 100 : null;
    const p50 = percentile(a.durations, 50);
    const p95 = percentile(a.durations, 95);
    const costPerDoc = a.docsCovered ? a.totalCostUSD / a.docsCovered : 0;
    rows.push({
      model,
      calls: a.calls,
      failures: a.failures,
      jsonParseFailures: a.jsonParseFailures,
      controlAccuracyPct: controlAcc?.toFixed(1) ?? "n/a",
      agreementWithBaselinePct: agreement?.toFixed(1) ?? "n/a",
      unknownSharePct: unknownShare?.toFixed(1) ?? "n/a",
      p50Ms: p50,
      p95Ms: p95,
      costPerDocUSD: costPerDoc.toFixed(5),
      totalCostUSD: a.totalCostUSD.toFixed(4),
    });
  }
  console.table(rows);

  console.log("\n=== Per-role confusion matrix (controls only, expected -> got) ===");
  const confusionByModel: Record<string, Array<{ expected: string; got: string; count: number }>> = {};
  for (const model of MODELS) {
    const a = perModel[model];
    if (a.confusion.size === 0) continue;
    console.log(`\n${model}:`);
    const entries = [...a.confusion.entries()]
      .map(([key, count]) => {
        const [expected, got] = key.split("|");
        return { expected, got, count };
      })
      .sort((x, y) => (x.expected === y.expected ? y.count - x.count : x.expected.localeCompare(y.expected)));
    confusionByModel[model] = entries;
    console.table(entries);
  }

  writeFileSync("/tmp/diplox-bench-task-a.json", JSON.stringify(rows, null, 2));
  writeFileSync("/tmp/diplox-bench-task-a-confusion.json", JSON.stringify(confusionByModel, null, 2));
  console.log("Written: /tmp/diplox-bench-task-a.json, /tmp/diplox-bench-task-a-confusion.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
