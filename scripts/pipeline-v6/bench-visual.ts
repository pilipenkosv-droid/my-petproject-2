// Visual bench: прогоняет runPipelineV6 на всех golden docs, конвертит output
// в PDF через LibreOffice, собирает визуальный отчёт.
//
// Usage:
//   BENCH_FORCE_MODEL=google-gemini-flash-lite npx tsx scripts/pipeline-v6/bench-visual.ts
//   BENCH_FORCE_MODEL=... npx tsx scripts/pipeline-v6/bench-visual.ts --subset=3
//   BENCH_FORCE_MODEL=... npx tsx scripts/pipeline-v6/bench-visual.ts --id=HpYh...
//
// Output: /tmp/v6-bench/<timestamp>/{id}.docx, {id}.pdf, report.json

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { runPipelineV6 } from "../../src/lib/pipeline-v6/orchestrator";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const REFERENCE_DOC = path.resolve("scripts/pipeline-v6/spike-pandoc/reference-gost.docx");
const GOLDEN_DIR = "data/golden/sanitized";

interface DocResult {
  id: string;
  elapsedMs: number;
  initialScore: number;
  finalScore: number;
  pdfPages: number | null;
  pdfPath: string;
  docxPath: string;
  error?: string;
}

function getPdfPageCount(pdfPath: string): number | null {
  try {
    const out = execSync(`pdfinfo "${pdfPath}"`).toString();
    const m = /Pages:\s*(\d+)/.exec(out);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function docxToPdf(docxPath: string, outDir: string): string {
  // soffice открывает всплывающее окно "recovery" если есть lock → --norestore.
  // UpdateFields:true заставляет LibreOffice обновить TOC-поля docx (автоматически
  // подставить заголовки + номера страниц). Без этого бенч-PDF остаются с
  // пустыми TOC-блоками, хотя docx содержит корректное w:sdt с TOC-fieldом.
  execSync(
    `soffice --headless --norestore --convert-to 'pdf:writer_pdf_Export:UpdateFields=true' "${docxPath}" --outdir "${outDir}"`,
    { stdio: "pipe" },
  );
  const base = path.basename(docxPath, ".docx");
  return path.join(outDir, `${base}.pdf`);
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const subsetArg = args.find((a) => a.startsWith("--subset="));
  const idArg = args.find((a) => a.startsWith("--id="));
  const outArg = args.find((a) => a.startsWith("--out="));
  const subset = subsetArg ? parseInt(subsetArg.split("=")[1], 10) : undefined;
  const onlyId = idArg ? idArg.split("=")[1] : undefined;
  const forcedOut = outArg ? outArg.split("=")[1] : undefined;
  const silent = args.includes("--silent");
  const log = (msg: string) => { if (!silent) console.log(msg); };

  if (!process.env.GEMINI_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
    console.error("No AI API key (GEMINI_API_KEY or AI_GATEWAY_API_KEY) in env");
    process.exit(1);
  }

  let ids = fs.readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".docx"))
    .map((f) => f.replace(/\.docx$/, ""))
    .sort();
  if (onlyId) ids = ids.filter((x) => x === onlyId);
  if (subset) ids = ids.slice(0, subset);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = forcedOut ?? `/tmp/v6-bench/${stamp}`;
  fs.mkdirSync(outDir, { recursive: true });
  log(`[bench-visual] output: ${outDir}`);
  log(`[bench-visual] docs: ${ids.length}`);

  const progressPath = path.join(outDir, "progress.json");
  const writeProgress = (state: object) => {
    fs.writeFileSync(progressPath, JSON.stringify(state, null, 2));
  };
  writeProgress({
    runId: stamp,
    outDir,
    total: ids.length,
    startedAt: new Date().toISOString(),
    currentIdx: null,
    finished: false,
    completed: [],
  });

  const results: DocResult[] = [];
  const updateProgress = (currentIdx: number | null, finished: boolean) => {
    writeProgress({
      runId: stamp,
      outDir,
      total: ids.length,
      startedAt: new Date().toISOString(),
      currentIdx,
      finished,
      completed: results.map((r) => ({
        id: r.id,
        initialScore: r.initialScore,
        finalScore: r.finalScore,
        elapsedMs: r.elapsedMs,
        pdfPages: r.pdfPages,
        status: r.error ? "fail" : "ok",
        errorClass: r.error ? classifyError(r.error) : undefined,
      })),
    });
  };

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const srcPath = path.join(GOLDEN_DIR, `${id}.docx`);
    const docxOut = path.join(outDir, `${id}.docx`);
    let pdfOut = "";
    let result: DocResult;
    updateProgress(i, false);
    log(`\n[${i + 1}/${ids.length}] ${id}`);
    try {
      const src = fs.readFileSync(srcPath);
      const t0 = Date.now();
      const r = await runPipelineV6(src, { documentId: id, referenceDoc: REFERENCE_DOC });
      const elapsed = Date.now() - t0;
      fs.writeFileSync(docxOut, r.output);
      try {
        pdfOut = docxToPdf(docxOut, outDir);
      } catch (e) {
        console.warn(`  pdf-convert fail: ${(e as Error).message.slice(0, 120)}`);
      }
      const pdfPages = pdfOut ? getPdfPageCount(pdfOut) : null;
      result = {
        id,
        elapsedMs: elapsed,
        initialScore: r.initialReport.score,
        finalScore: r.finalReport.score,
        pdfPages,
        pdfPath: pdfOut,
        docxPath: docxOut,
      };
      log(`  score: ${r.initialReport.score}→${r.finalReport.score}, ${elapsed}ms, pdf=${pdfPages}p`);
    } catch (err) {
      const msg = (err as Error).message || String(err);
      if (!silent) console.error(`  FAIL: ${msg.slice(0, 200)}`);
      result = { id, elapsedMs: 0, initialScore: 0, finalScore: 0, pdfPages: null, pdfPath: "", docxPath: docxOut, error: msg };
    }
    results.push(result);
    updateProgress(i, false);
    // rate-limit pause: Pro=2RPM→35s, Flash/Lite=15RPM→4.5s.
    const pauseMs = process.env.BENCH_PAUSE_MS
      ? parseInt(process.env.BENCH_PAUSE_MS, 10)
      : process.env.BENCH_FORCE_MODEL?.includes("pro") ? 35000 : 4500;
    if (i < ids.length - 1) await new Promise((r) => setTimeout(r, pauseMs));
  }

  const report = {
    timestamp: stamp,
    outDir,
    total: results.length,
    avgFinalScore: results.length ? Math.round(results.reduce((s, r) => s + r.finalScore, 0) / results.length) : 0,
    failures: results.filter((r) => r.error).length,
    results,
  };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  updateProgress(null, true);
  log(`\n[bench-visual] done. avg finalScore=${report.avgFinalScore}, failures=${report.failures}`);
  log(`[bench-visual] report: ${outDir}/report.json`);
}

function classifyError(msg: string): string {
  if (/pandoc/i.test(msg)) return "pandoc_fail";
  if (/soffice|libreoffice|UpdateFields/i.test(msg)) return "pdf_convert_fail";
  if (/429|rate.?limit|quota/i.test(msg)) return "rate_limit";
  if (/timeout|ETIMEDOUT/i.test(msg)) return "timeout";
  if (/xml|parser/i.test(msg)) return "xml_parse_fail";
  if (/policy|safety|classifier/i.test(msg)) return "provider_policy";
  return "pipeline_throw";
}

main().catch((e) => { console.error(e); process.exit(1); });
