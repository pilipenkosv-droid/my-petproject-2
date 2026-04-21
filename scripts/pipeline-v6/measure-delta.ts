// Runs pipeline-v6 orchestrator on N golden raw docs and compares scores
// against baseline bench-reports/v6/baseline-2026-04-21.json. When run with
// --save, writes bench-reports/v6/v6-<date>.json as a proper v6 benchmark.
//
// Usage:
//   npx tsx scripts/pipeline-v6/measure-delta.ts [count=3]
//   npx tsx scripts/pipeline-v6/measure-delta.ts 19 --save

import * as fs from "fs";
import * as path from "path";
import { runPipelineV6 } from "../../src/lib/pipeline-v6/orchestrator";

const GOLDEN_DIR = path.join(process.cwd(), "data/golden/raw");
const BASELINE = path.join(process.cwd(), "bench-reports/v6/baseline-2026-04-21.json");

async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args.find((a) => !a.startsWith("--")) ?? "3", 10);
  const save = args.includes("--save");
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const byId = new Map<string, number>();
  // run-checker writes per-doc scores under `reports`, not `documents`.
  for (const d of baseline.reports ?? baseline.documents ?? []) {
    byId.set(d.id, d.score);
  }

  const files = fs.readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".docx")).slice(0, count);
  const results: Array<{ id: string; baselineScore: number | null; v6Score: number; delta: number; ms: number }> = [];

  for (const file of files) {
    const id = file.replace(/\.docx$/, "");
    const buf = fs.readFileSync(path.join(GOLDEN_DIR, file));
    try {
      const res = await runPipelineV6(buf, {
        documentId: id,
        rewrite: false,
        metadata: { title: id, lang: "ru" },
        fixIterations: 1,
      });
      const baseScore = byId.get(id) ?? null;
      const v6Score = res.finalReport.score;
      results.push({
        id,
        baselineScore: baseScore,
        v6Score,
        delta: baseScore !== null ? v6Score - baseScore : 0,
        ms: res.timings.totalMs,
      });
      console.log(`${id}: baseline=${baseScore ?? "n/a"} v6=${v6Score} delta=${baseScore !== null ? (v6Score - baseScore).toFixed(0) : "n/a"} (${res.timings.totalMs}ms)`);
    } catch (e) {
      console.error(`${id}: FAIL —`, e instanceof Error ? e.message : e);
    }
  }

  if (results.length) {
    const avgV6 = results.reduce((a, r) => a + r.v6Score, 0) / results.length;
    const baselineAvg = baseline.avg_score ?? baseline.summary?.avgScore ?? 76;
    console.log(`\n=== Summary (${results.length} docs) ===`);
    console.log(`baseline avg: ${baselineAvg}`);
    console.log(`v6 avg: ${avgV6.toFixed(1)}`);
    console.log(`delta: ${(avgV6 - baselineAvg).toFixed(1)}`);
    if (save) {
      const date = new Date().toISOString().slice(0, 10);
      const outPath = path.join(process.cwd(), `bench-reports/v6/v6-${date}.json`);
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            date,
            n: results.length,
            baselineAvg,
            v6Avg: Number(avgV6.toFixed(1)),
            delta: Number((avgV6 - baselineAvg).toFixed(1)),
            documents: results,
          },
          null,
          2,
        ),
      );
      console.log(`saved: ${outPath}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
