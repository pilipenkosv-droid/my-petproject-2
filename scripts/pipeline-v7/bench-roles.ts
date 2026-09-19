/**
 * B3 (role-bench, w38/26-role-bench): the metric the plan calls missing —
 * accuracy / per-role precision-recall / confusion matrix / unknown share
 * for the v7 classifier, against hand-labelled gold (`labels-import.ts`
 * output), computed for T0-only and, optionally, T0+LLM.
 *
 * Only ids and numbers reach stdout — never paragraph text.
 *
 *   npx tsx scripts/pipeline-v7/bench-roles.ts
 *   npx tsx scripts/pipeline-v7/bench-roles.ts --llm   # uses Gemini free-tier quota, see warning below
 *   npx tsx scripts/pipeline-v7/bench-roles.ts --dir=data/golden/labels --docs-dir=data/corpus/real
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import { classifyResidueWithLlm } from "@/lib/pipeline-v7/classify/llm";
import type { ClassificationResult, Role } from "@/lib/pipeline-v7/classify/types";
import { computeMetrics, type GoldLabel, type RoleMetrics } from "./bench-roles-metrics";

const DEFAULT_LABELS_DIR = "data/golden/labels";
const DOC_SEARCH_DIRS = ["data/corpus/real", "data/corpus/synthetic"];

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) {
      out[m[1]] = m[2];
      continue;
    }
    const flag = /^--(.+)$/.exec(arg);
    if (flag) out[flag[1]] = true;
  }
  return out;
}

interface LabelFile {
  documentId: string;
  labels: GoldLabel[];
}

function loadLabels(dir: string): LabelFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
      return { documentId: raw.documentId as string, labels: raw.labels as GoldLabel[] };
    });
}

function findDocx(documentId: string, docsDirs: string[]): string | undefined {
  for (const dir of docsDirs) {
    const candidate = join(dir, `${documentId}.docx`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function predictedFromT0(result: ClassificationResult): Map<number, Role> {
  const m = new Map<number, Role>();
  result.list.forEach((cp, i) => m.set(i, cp.role));
  return m;
}

async function predictedFromT0PlusLlm(result: ClassificationResult): Promise<Map<number, Role>> {
  const m = predictedFromT0(result);
  const llmResult = await classifyResidueWithLlm(result);
  const index = new Map(result.list.map((cp, i) => [cp, i] as const));
  for (const batch of llmResult.batches) {
    for (const assignment of batch.assignments) {
      const cp = batch.items[assignment.i];
      if (!cp) continue;
      const idx = index.get(cp);
      if (idx === undefined) continue;
      m.set(idx, assignment.role as Role);
    }
  }
  return m;
}

function printMetrics(label: string, m: RoleMetrics): void {
  console.log(`\n--- ${label} ---`);
  console.log(
    `matched=${m.matched}/${m.total} correct=${m.correct} accuracy=${m.accuracy !== null ? (m.accuracy * 100).toFixed(1) + "%" : "n/a"} unknownShare=${
      m.unknownShare !== null ? (m.unknownShare * 100).toFixed(1) + "%" : "n/a"
    }`
  );
  console.log("Per-role precision/recall:");
  console.table(
    m.perRole.map((r) => ({
      role: r.role,
      tp: r.tp,
      fp: r.fp,
      fn: r.fn,
      precision: r.precision !== null ? (r.precision * 100).toFixed(1) : "n/a",
      recall: r.recall !== null ? (r.recall * 100).toFixed(1) : "n/a",
    }))
  );
  const confusionRows = [...m.confusion.entries()]
    .filter(([key]) => {
      const [g, p] = key.split("|");
      return g !== p;
    })
    .map(([key, count]) => {
      const [gold, predicted] = key.split("|");
      return { gold, predicted, count };
    })
    .sort((a, b) => b.count - a.count);
  if (confusionRows.length > 0) {
    console.log("Confusion (gold -> predicted, mismatches only):");
    console.table(confusionRows);
  } else {
    console.log("Confusion: no mismatches.");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const labelsDir = typeof args.dir === "string" ? args.dir : DEFAULT_LABELS_DIR;
  const docsDirs = typeof args["docs-dir"] === "string" ? [args["docs-dir"] as string] : DOC_SEARCH_DIRS;
  const useLlm = args.llm === true;

  if (!existsSync(labelsDir) || !statSync(labelsDir).isDirectory()) {
    console.error(`Labels directory not found: ${labelsDir}`);
    process.exit(1);
  }

  if (useLlm) {
    console.warn(
      "[bench-roles] --llm calls the production LLM residue layer (Gemini via AI Gateway) and spends the free-tier quota. " +
        "On 429 (AllModelsUnavailableError) do NOT switch providers — see .claude/rules/llm-quota-fallback.md."
    );
  }

  const files = loadLabels(labelsDir);
  if (files.length === 0) {
    console.error(`No label files in ${labelsDir}.`);
    process.exit(1);
  }

  const t0Metrics: RoleMetrics[] = [];
  const llmMetrics: RoleMetrics[] = [];
  const t0GoldAll: GoldLabel[] = [];
  const t0PredAll = new Map<number, Role>();
  const llmGoldAll: GoldLabel[] = [];
  const llmPredAll = new Map<number, Role>();
  let nextOffset = 0;

  for (const { documentId, labels } of files) {
    const docxPath = findDocx(documentId, docsDirs);
    if (!docxPath) {
      console.warn(`  skip ${documentId}: docx not found in [${docsDirs.join(", ")}]`);
      continue;
    }
    const pkg = await DocxPackage.load(readFileSync(docxPath));
    const result = await classifyDocument(pkg);

    const t0Pred = predictedFromT0(result);
    const t0m = computeMetrics(labels, t0Pred);
    t0Metrics.push(t0m);
    console.log(`  ${documentId}: T0-only accuracy=${t0m.accuracy !== null ? (t0m.accuracy * 100).toFixed(1) + "%" : "n/a"} (${t0m.matched}/${t0m.total})`);

    for (const g of labels) {
      t0GoldAll.push({ i: nextOffset + g.i, role: g.role });
    }
    for (const [i, role] of t0Pred) t0PredAll.set(nextOffset + i, role);

    if (useLlm) {
      const llmPred = await predictedFromT0PlusLlm(result);
      const llmm = computeMetrics(labels, llmPred);
      llmMetrics.push(llmm);
      console.log(
        `  ${documentId}: T0+LLM accuracy=${llmm.accuracy !== null ? (llmm.accuracy * 100).toFixed(1) + "%" : "n/a"} (${llmm.matched}/${llmm.total})`
      );
      for (const g of labels) llmGoldAll.push({ i: nextOffset + g.i, role: g.role });
      for (const [i, role] of llmPred) llmPredAll.set(nextOffset + i, role);
    }

    nextOffset += result.list.length;
  }

  if (t0GoldAll.length === 0) {
    console.error("No document had a matching docx — nothing to score.");
    process.exit(1);
  }

  printMetrics(`T0-only, aggregate over ${t0Metrics.length} doc(s)`, computeMetrics(t0GoldAll, t0PredAll));
  if (useLlm && llmGoldAll.length > 0) {
    printMetrics(`T0+LLM, aggregate over ${llmMetrics.length} doc(s)`, computeMetrics(llmGoldAll, llmPredAll));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
