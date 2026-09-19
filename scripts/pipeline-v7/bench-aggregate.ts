/**
 * Aggregates the model-bench results (branch w38/26-model-bench) from the
 * JSON files the bench scripts already wrote, and renders the Markdown
 * tables used in docs/bench/2026-09-18-model-bench.md.
 *
 * IMPORTANT: bench-task-a.ts and bench-task-b.ts only ever persisted
 * pre-aggregated per-model summary rows to /tmp — no per-doc/per-model raw
 * records exist on disk. This script can therefore only re-derive totals
 * (spend, pass/fail) from those summaries; it cannot reconstruct a
 * confusion matrix or field-level agreement breakdown, since that detail
 * was never written anywhere. That gap is called out explicitly below.
 *
 *   npx tsx scripts/pipeline-v7/bench-aggregate.ts
 */
import { readFileSync, existsSync } from "node:fs";

const TASK_A_FILE = "/tmp/diplox-bench-task-a.json";
const TASK_B_FILE = "/tmp/diplox-bench-task-b.json";
const SPEND_FILE = "/tmp/diplox-model-bench-spend.json";
const APPROVED_USD = 0.6;
const HARD_CAP_USD = 1.0;

interface TaskARow {
  model: string;
  calls: number;
  failures: number;
  jsonParseFailures: number;
  controlAccuracyPct: string;
  agreementWithBaselinePct: string;
  unknownSharePct: string;
  p50Ms: number;
  p95Ms: number;
  costPerDocUSD: string;
  totalCostUSD: string;
}

interface TaskBRow {
  model: string;
  calls: number;
  failures: number;
  jsonParseFailures: number;
  exactMatchVsBaselinePct: string;
  p50Ms: number;
  p95Ms: number;
  totalCostUSD: string;
  costPerDocUSD: string;
}

interface TaskBFile {
  jobsUsed: Array<{ id: string; synthetic: boolean }>;
  rows: TaskBRow[];
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function mdTableA(rows: TaskARow[]): string {
  const header =
    "| Модель | Запросов | Ошибок | JSON-парсинг не прошёл | Точность на контролях, % | Согласие с flash, % | Доля unknown, % | p50, мс | p95, мс | $/документ | $ всего |\n" +
    "|---|---|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map(
    (r) =>
      `| ${r.model} | ${r.calls} | ${r.failures} | ${r.jsonParseFailures} | ${r.controlAccuracyPct} | ${r.agreementWithBaselinePct} | ${r.unknownSharePct} | ${r.p50Ms} | ${r.p95Ms} | $${r.costPerDocUSD} | $${r.totalCostUSD} |`
  );
  return [header, ...lines].join("\n");
}

function mdTableB(rows: TaskBRow[]): string {
  const header =
    "| Модель | Запросов | Ошибок | JSON-парсинг не прошёл | Точное совпадение полей с flash, % | p50, мс | p95, мс | $/документ | $ всего |\n" +
    "|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map(
    (r) =>
      `| ${r.model} | ${r.calls} | ${r.failures} | ${r.jsonParseFailures} | ${r.exactMatchVsBaselinePct} | ${r.p50Ms} | ${r.p95Ms} | $${r.costPerDocUSD} | $${r.totalCostUSD} |`
  );
  return [header, ...lines].join("\n");
}

function main(): void {
  if (!existsSync(TASK_A_FILE) || !existsSync(TASK_B_FILE)) {
    console.error("Missing /tmp/diplox-bench-task-{a,b}.json — run the bench scripts first.");
    process.exit(1);
  }

  const taskA = loadJson<TaskARow[]>(TASK_A_FILE);
  const taskB = loadJson<TaskBFile>(TASK_B_FILE);

  const sumA = taskA.reduce((s, r) => s + parseFloat(r.totalCostUSD), 0);
  const sumB = taskB.rows.reduce((s, r) => s + parseFloat(r.totalCostUSD), 0);
  const totalSpend = sumA + sumB;

  let spendFileTotal: number | null = null;
  if (existsSync(SPEND_FILE)) {
    try {
      spendFileTotal = loadJson<{ cumulativeUSD: number }>(SPEND_FILE).cumulativeUSD;
    } catch {
      spendFileTotal = null;
    }
  }

  const taskBAllFailed = taskB.rows.every((r) => r.calls === 0);
  const taskBRealJobs = taskB.jobsUsed.filter((j) => !j.synthetic).length;

  console.log("=== Task A (paragraph role classification) ===\n");
  console.log(mdTableA(taskA));

  console.log("\n=== Task B (методичка rule extraction) ===\n");
  console.log(`jobsUsed: ${taskB.jobsUsed.length} (real: ${taskBRealJobs}, synthetic: ${taskB.jobsUsed.length - taskBRealJobs})`);
  if (taskBAllFailed) {
    console.log("WARNING: every model reports calls=0 — all gateway requests in Task B failed (HTTP/network error before any usage was recorded). No field-agreement data exists.");
  }
  console.log(mdTableB(taskB.rows));

  console.log("\n=== Spend ===\n");
  console.log(`Task A total: $${sumA.toFixed(4)}`);
  console.log(`Task B total: $${sumB.toFixed(4)}`);
  console.log(`Sum from result files: $${totalSpend.toFixed(4)}`);
  if (spendFileTotal !== null) {
    console.log(`Spend-tracker cumulative (${SPEND_FILE}): $${spendFileTotal.toFixed(4)}`);
    if (Math.abs(spendFileTotal - totalSpend) > 0.005) {
      console.log(
        `NOTE: tracker total exceeds the sum of the two result files by $${(spendFileTotal - totalSpend).toFixed(4)} — likely spend from other scripts sharing the same SPEND_FILE (e.g. gateway-probe.ts, debug-taskb.ts) or a partial/earlier run.`
      );
    }
  }
  const reference = spendFileTotal ?? totalSpend;
  console.log(`Approved budget: $${APPROVED_USD.toFixed(2)}, hard cap: $${HARD_CAP_USD.toFixed(2)}`);
  console.log(reference <= APPROVED_USD ? "Within approved budget." : "OVER approved budget.");
  console.log(reference <= HARD_CAP_USD ? "Within hard cap." : "OVER hard cap.");
}

main();
