/**
 * Verifies the 25s MARKUP_BUDGET_MS fix on real documents.
 *
 * Runs the legacy upload-mode stages exactly as
 * src/app/api/confirm-rules/route.ts does:
 *   parseDocxStructure -> enrichWithBlockMarkup -> analyzeDocument -> formatDocument
 * against every doc in data/corpus/real/manifest.json with jobStatus === "failed"
 * (8 docs), plus the 2 largest non-failed docs by paragraph count (for contrast).
 *
 * Run twice: once with the default budget, once with MARKUP_BUDGET_MS=15000
 * (see scripts/tg-pains-style two-pass usage below).
 *
 * PRIVACY: never prints document text, paragraph text, or original file names —
 * only ids (first 8 chars), counts, timings, and error strings.
 *
 * Usage:
 *   npx tsx scripts/pipeline-v7/bench-legacy-timing.ts
 *   MARKUP_BUDGET_MS=15000 npx tsx scripts/pipeline-v7/bench-legacy-timing.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  parseDocxStructure,
  enrichWithBlockMarkup,
  analyzeDocument,
} from "../../src/lib/pipeline/document-analyzer";
import { formatDocument } from "../../src/lib/pipeline/document-formatter";
import { mergeWithDefaults } from "../../src/lib/ai/provider";

const CORPUS_DIR = "data/corpus/real";
const MANIFEST_PATH = path.join(CORPUS_DIR, "manifest.json");

interface ManifestDoc {
  id: string;
  file: string;
  features: { paragraphs: number; tables: number };
  jobStatus: string;
}

interface Row {
  id: string;
  paragraphs: number;
  tables: number;
  markupMs: number;
  markupDegraded: boolean;
  degradedChunks: number;
  analyzeMs: number;
  formatMs: number;
  totalMs: number;
  ok: boolean;
  error?: string;
}

function selectDocs(): ManifestDoc[] {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const docs: ManifestDoc[] = manifest.docs;
  const failed = docs.filter((d) => d.jobStatus === "failed");
  const nonFailed = docs
    .filter((d) => d.jobStatus !== "failed")
    .sort((a, b) => b.features.paragraphs - a.features.paragraphs)
    .slice(0, 2);
  return [...failed, ...nonFailed];
}

async function runDoc(doc: ManifestDoc): Promise<Row> {
  const buf = fs.readFileSync(path.join(CORPUS_DIR, doc.file));
  const rules = mergeWithDefaults({});
  const t0 = Date.now();
  try {
    const docxStructure = await parseDocxStructure(buf);
    const tParse = Date.now();

    const markupResult = await enrichWithBlockMarkup(docxStructure.paragraphs);
    const tMarkup = Date.now();

    const analysisResult = await analyzeDocument(buf, rules, markupResult.paragraphs);
    const tAnalyze = Date.now();

    await formatDocument(buf, rules, analysisResult.violations, markupResult.paragraphs, "trial");
    const tFormat = Date.now();

    return {
      id: doc.id.slice(0, 8),
      paragraphs: doc.features.paragraphs,
      tables: doc.features.tables,
      markupMs: tMarkup - tParse,
      markupDegraded: markupResult.markupDegraded,
      degradedChunks: markupResult.markupDegradedChunks,
      analyzeMs: tAnalyze - tMarkup,
      formatMs: tFormat - tAnalyze,
      totalMs: tFormat - t0,
      ok: true,
    };
  } catch (err) {
    const totalMs = Date.now() - t0;
    return {
      id: doc.id.slice(0, 8),
      paragraphs: doc.features.paragraphs,
      tables: doc.features.tables,
      markupMs: -1,
      markupDegraded: false,
      degradedChunks: 0,
      analyzeMs: -1,
      formatMs: -1,
      totalMs,
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 80),
    };
  }
}

function printTable(rows: Row[]) {
  const header = [
    "id",
    "paragraphs",
    "tables",
    "markupMs",
    "degraded",
    "chunks",
    "analyzeMs",
    "formatMs",
    "totalMs",
    "status",
  ];
  console.log(header.join("\t"));
  for (const r of rows) {
    console.log(
      [
        r.id,
        r.paragraphs,
        r.tables,
        r.markupMs,
        r.markupDegraded,
        r.degradedChunks,
        r.analyzeMs,
        r.formatMs,
        r.totalMs,
        r.ok ? "ok" : `error: ${r.error}`,
      ].join("\t")
    );
  }
}

function printSummary(rows: Row[]) {
  const totals = rows.map((r) => r.totalMs).sort((a, b) => a - b);
  const p50 = totals[Math.floor((totals.length - 1) * 0.5)];
  const max = totals[totals.length - 1];
  const under50s = rows.filter((r) => r.ok && r.totalMs < 50_000).length;
  console.log(`\np50 totalMs=${p50}  max totalMs=${max}  docs < 50000ms: ${under50s}/${rows.length}`);
}

async function main() {
  const budgetMs = process.env.MARKUP_BUDGET_MS ?? "25000 (default)";
  console.log(`\n=== bench-legacy-timing (MARKUP_BUDGET_MS=${budgetMs}) ===`);
  const docs = selectDocs();
  const rows: Row[] = [];
  for (const doc of docs) {
    const row = await runDoc(doc);
    rows.push(row);
    console.log(`done: ${row.id} totalMs=${row.totalMs} ok=${row.ok}`);
  }
  console.log("");
  printTable(rows);
  printSummary(rows);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
