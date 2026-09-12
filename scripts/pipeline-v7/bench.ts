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

const SYNTHETIC_DIR = "data/corpus/synthetic";
const REAL_DIR = "/Users/sergejpilipenko/diplox/data/corpus/real";

interface Doc { id: string; set: "synthetic" | "real"; file: string }

interface Side {
  gate: boolean | null;
  violations: string[];
  score: number | null;
  ms: number;
  /** Checker rule ids still failing (v7 only). */
  failed?: string[];
  error?: string;
}

interface Row {
  id: string;
  set: "synthetic" | "real";
  v7: Side;
  v6?: Side;
  legacy?: Side;
  pages: { src: number | null; v7: number | null; v6: number | null };
  sofficeRefusedV7?: boolean;
}

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
      score: r.report.checker.finalScore,
      ms: Date.now() - t0,
      failed: r.report.checker.failed,
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

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const percentile = (xs: number[], q: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
};

const mark = (v: boolean | null): string => (v === null ? "—" : v ? "да" : "НЕТ");
const num = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : String(v));

function markdownTable(rows: Row[]): string {
  const head =
    "| doc | набор | v7 гейт | v7 diff (топ) | v7 score | v7 мс | v6 гейт | v6 diff (топ) | v6 score | leg гейт | leg score | стр. src/v7/v6 |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|---|";
  const body = rows.map((r) => {
    const cell = (s?: Side) => (s ? [mark(s.gate), s.violations[0]?.slice(0, 60) ?? (s.error ? `ошибка: ${s.error.slice(0, 40)}` : "—"), num(s.score)] : ["—", "—", "—"]);
    const [v6g, v6d, v6s] = cell(r.v6);
    const [lg, , ls] = cell(r.legacy);
    const v7d = r.v7.violations[0]?.slice(0, 60) ?? (r.v7.error ? `ошибка: ${r.v7.error.slice(0, 40)}` : "—");
    return `| ${r.id.slice(0, 22)} | ${r.set} | ${mark(r.v7.gate)} | ${v7d} | ${num(r.v7.score)} | ${r.v7.ms} | ${v6g} | ${v6d} | ${v6s} | ${lg} | ${ls} | ${num(r.pages.src)}/${num(r.pages.v7)}/${num(r.pages.v6)} |`;
  });
  return [head, sep, ...body].join("\n");
}

function criteria(rows: Row[]): string[] {
  const syn = rows.filter((r) => r.set === "synthetic");
  const real = rows.filter((r) => r.set === "real");
  const passed = (rs: Row[], pick: (r: Row) => Side | undefined) =>
    rs.filter((r) => pick(r)?.gate === true).length;
  const v7syn = passed(syn, (r) => r.v7);
  const v7real = passed(real, (r) => r.v7);
  const realWithV6 = real.filter((r) => r.v6);
  const v6realFail = realWithV6.filter((r) => r.v6!.gate === false).length;
  const v7scores = rows.map((r) => r.v7.score).filter((x): x is number => x !== null);
  const v6scores = rows.map((r) => r.v6?.score).filter((x): x is number => x != null);
  const mv7 = median(v7scores);
  const mv6 = median(v6scores);
  const regressions = rows.filter(
    (r) => r.v7.score !== null && r.v7.score < 70 && (r.v6?.score ?? 0) > 70
  );
  const p95 = percentile(rows.map((r) => r.v7.ms), 0.95);
  const synOk = syn.length > 0 && v7syn === syn.length;
  const realOk = real.length > 0 && v7real / real.length >= 0.9;
  const c2 = mv7 !== null && mv6 !== null && mv7 >= mv6 && regressions.length === 0;
  const failShare = realWithV6.length ? v6realFail / realWithV6.length : 0;
  const out = [
    `(1) гейт v7: synthetic ${v7syn}/${syn.length}, real ${v7real}/${real.length} (порог 90 %) → ${synOk && realOk ? "ДА" : "НЕТ"}`,
    `(2) медиана score v7 ${num(mv7)} vs v6 ${num(mv6)}, регрессий (v7<70 при v6>70) ${regressions.length}${regressions.length ? ` [${regressions.map((r) => r.id.slice(0, 8)).join(", ")}]` : ""} → ${c2 ? "ДА" : "НЕТ"}`,
    `(3) p95 времени v7 ${num(p95)} мс < 8000 → ${p95 !== null && p95 < 8000 ? "ДА" : "НЕТ"}`,
    `(4) v6 не проходит гейт на ${realWithV6.length ? Math.round(failShare * 100) : 0} % реальных (порог 60 %) → ${failShare >= 0.6 ? "ДА" : "НЕТ"}`,
  ];
  const refused = rows.filter((r) => r.sofficeRefusedV7).map((r) => r.id.slice(0, 12));
  out.push(`LibreOffice отказался конвертировать v7: ${refused.length ? refused.join(", ") : "нет"}`);
  return out;
}

function summary(rows: Row[]): string[] {
  const lines: string[] = [];
  for (const set of ["synthetic", "real"] as const) {
    const rs = rows.filter((r) => r.set === set);
    if (!rs.length) continue;
    lines.push(
      `${set}: v7 гейт ${rs.filter((r) => r.v7.gate === true).length}/${rs.length}, ` +
        `v6 гейт ${rs.filter((r) => r.v6?.gate === true).length}/${rs.filter((r) => r.v6).length}, ` +
        `медиана score v7 ${num(median(rs.map((r) => r.v7.score).filter((x): x is number => x !== null)))}, ` +
        `v6 ${num(median(rs.map((r) => r.v6?.score).filter((x): x is number => x != null)))}, ` +
        `p95 v7 ${num(percentile(rs.map((r) => r.v7.ms), 0.95))} мс`
    );
  }
  return lines;
}

function topFailed(rows: Row[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const id of r.v7.failed ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, n]) => `${id} ×${n}`);
}

function topViolations(rows: Row[], pick: (r: Row) => Side | undefined): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const v of pick(r)?.violations ?? []) {
      const kind = v.split(":")[0];
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`);
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
