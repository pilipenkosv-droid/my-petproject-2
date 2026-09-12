/**
 * v7 bench: runs pipeline-v7 over the synthetic and real corpora, optionally
 * against pipeline-v6 and the legacy upload path, and judges the four go/no-go
 * criteria of the experiment.
 *
 * Usage:
 *   npx tsx scripts/pipeline-v7/bench.ts [--set=synthetic|real|all] [--id=<substr>]
 *     [--compare=v6,legacy] [--pdf] [--text-norm] [--out=<dir>]
 *
 * PRIVACY: ids, counts, timings and rule codes only — never document text.
 * Real documents are read as bytes from the sibling checkout; nothing is
 * written back there.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { GOST_7_32 } from "../../src/lib/pipeline-v6/rule-packs/gost-7-32";
import { computeFingerprint } from "../../src/lib/pipeline-v7/fingerprint/compute";
import { evaluateGate } from "../../src/lib/pipeline-v7/fingerprint/gate";
import { runPipelineV7 } from "../../src/lib/pipeline-v7/orchestrator";
import { violationSummaries } from "../../src/lib/pipeline-v7/report";
import { runV6, runLegacy, renderPdf } from "./bench-runners";
import {
  criteria,
  mark,
  markdownTable,
  num,
  summary,
  topFailed,
  topViolations,
  type Row,
} from "./bench-report";

const SYNTHETIC_DIR = "data/corpus/synthetic";
const REAL_DIR = "/Users/sergejpilipenko/diplox/data/corpus/real";

interface Doc { id: string; set: "synthetic" | "real"; file: string }

function listDocs(set: string, idFilter?: string): Doc[] {
  const docs: Doc[] = [];
  const add = (dir: string, s: "synthetic" | "real") => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".docx")).sort()) {
      docs.push({ id: f.replace(/\.docx$/, ""), set: s, file: path.join(dir, f) });
    }
  };
  if (set === "synthetic" || set === "all") add(SYNTHETIC_DIR, "synthetic");
  if (set === "real" || set === "all") add(REAL_DIR, "real");
  return idFilter ? docs.filter((d) => d.id.includes(idFilter)) : docs;
}

/** Applies the v7 fidelity gate to any pipeline's output. */
async function gateOutput(input: Buffer, output: Buffer | undefined) {
  if (!output) return { gate: null, violations: [] as string[] };
  const result = evaluateGate(await computeFingerprint(input), await computeFingerprint(output), {
    allowTextNormalization: false,
  });
  return {
    gate: result.pass,
    violations: result.violations.slice(0, 3).map((v) => `${v.kind}: ${v.message}`),
  };
}

interface BenchOpts {
  compare: string[];
  pdf: boolean;
  outDir: string;
  textNormalization: boolean;
}

async function benchDoc(doc: Doc, o: BenchOpts): Promise<Row> {
  const { compare, pdf, outDir } = o;
  const input = fs.readFileSync(doc.file);
  const row: Row = {
    id: doc.id,
    set: doc.set,
    v7: { gate: null, violations: [], score: null, ms: 0 },
    pages: { src: null, v7: null, v6: null },
  };

  const t0 = Date.now();
  try {
    const r = await runPipelineV7(input, {
      pack: GOST_7_32,
      documentId: doc.id,
      returnOnGateFail: true,
      textNormalization: o.textNormalization,
    });
    row.v7 = {
      gate: r.report.gate.pass,
      violations: violationSummaries(r.report, 3),
      score: r.report.checker.finalScoreUndef,
      scoreRoles: r.report.checker.finalScoreRoles,
      ms: Date.now() - t0,
      formatMs: r.report.timings.formatMs,
      failed: r.report.checker.failed,
      refused: r.report.refused !== undefined,
    };
    if (pdf) {
      row.pages.src = renderPdf(input, outDir, `${doc.id}-src`);
      const v7buf = r.output ?? null;
      row.pages.v7 = v7buf ? renderPdf(v7buf, outDir, `${doc.id}-v7`) : null;
      row.sofficeRefusedV7 = v7buf !== null && row.pages.v7 === null;
    }
  } catch (err) {
    row.v7.ms = Date.now() - t0;
    row.v7.error = (err instanceof Error ? err.message : String(err)).slice(0, 120);
  }

  if (compare.includes("v6")) {
    // runV6 reports the score its own orchestrator computes, which supplies no
    // enriched paragraphs — the same (a) form as v7's `score`. The roles-aware
    // (b′) variant is deliberately not computed: v6 rewrites the document
    // through pandoc, so its output paragraphs do not line up with v7's
    // classification of the original by index, and a mapping that silently
    // slips by one would produce a number that looks fair and is not.
    const r = await runV6(input, doc.id);
    const g = await gateOutput(input, r.output);
    row.v6 = { ...g, score: r.score ?? null, ms: r.ms, error: r.error };
    if (pdf && r.output) row.pages.v6 = renderPdf(r.output, outDir, `${doc.id}-v6`);
  }
  if (compare.includes("legacy")) {
    const r = await runLegacy(input, doc.id, GOST_7_32);
    const g = await gateOutput(input, r.output);
    row.legacy = { ...g, score: r.score ?? null, ms: r.ms, error: r.error };
  }
  return row;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const set = value("set") ?? "all";
  const idFilter = value("id");
  const compare = (value("compare") ?? "").split(",").filter(Boolean);
  const pdf = args.includes("--pdf");
  const textNormalization = args.includes("--text-norm");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1-$2");
  const outDir = value("out") ?? `/tmp/v7-bench/${stamp}`;
  fs.mkdirSync(outDir, { recursive: true });

  const docs = listDocs(set, idFilter);
  console.log(
    `[bench] документов: ${docs.length}, сравнение: ${compare.join(",") || "нет"}, ` +
      `нормализация пробелов: ${textNormalization ? "да" : "нет"}, вывод: ${outDir}`
  );

  const rows: Row[] = [];
  for (let i = 0; i < docs.length; i++) {
    const row = await benchDoc(docs[i], { compare, pdf, outDir, textNormalization });
    rows.push(row);
    console.log(
      `[${i + 1}/${docs.length}] ${row.id.slice(0, 22)} v7=${mark(row.v7.gate)} score=${num(row.v7.score)} ${row.v7.ms}мс` +
        (row.v6 ? ` | v6=${mark(row.v6.gate)} score=${num(row.v6.score)} ${row.v6.ms}мс` : "") +
        (row.legacy ? ` | leg=${mark(row.legacy.gate)} score=${num(row.legacy.score)}` : "")
    );
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ outDir, rows }, null, 2));
  }

  const md = [
    `# v7 bench — ${new Date().toISOString()}`,
    "",
    markdownTable(rows),
    "",
    "## Итоги",
    ...summary(rows).map((l) => `- ${l}`),
    "",
    "## Критерии go/no-go",
    ...criteria(rows).map((l) => `- ${l}`),
    "",
    "## Частые провалы чекера (v7)",
    ...topFailed(rows).map((l) => `- ${l}`),
    "",
    "## Частые нарушения гейта",
    `- v7: ${topViolations(rows, (r) => r.v7).join(", ") || "нет"}`,
    `- v6: ${topViolations(rows, (r) => r.v6).join(", ") || "нет"}`,
    `- legacy: ${topViolations(rows, (r) => r.legacy).join(", ") || "нет"}`,
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "report.md"), md);
  fs.rmSync(path.join(outDir, ".pdf-work"), { recursive: true, force: true });
  console.log(`\n${md}\n\n[bench] отчёты: ${outDir}/report.{json,md}`);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
