/**
 * Тестовый стенд качества форматирования
 *
 * Прогоняет документы через полный pipeline форматирования,
 * затем запускает 30+ программных проверок (Level 1).
 *
 * Результат: JSON-отчёт + консольный summary.
 * Opus (Level 2) анализирует отчёт в Claude Code сессии.
 *
 * Запуск:
 *   npx tsx scripts/format-quality-bench.ts                          — все дефолтные документы
 *   npx tsx scripts/format-quality-bench.ts prqZG08LGNO58ld0s_Ajk   — один конкретный
 *   npx tsx scripts/format-quality-bench.ts doc1 doc2 doc3           — несколько
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { parseDocxStructure, enrichWithBlockMarkup, analyzeDocument } from "../src/lib/pipeline/document-analyzer";
import { formatDocument } from "../src/lib/pipeline/document-formatter";
import { DEFAULT_GOST_RULES } from "../src/types/formatting-rules";
import { mergeWithDefaults } from "../src/lib/ai/provider";
import { markModelFailed, recordUsage } from "../src/lib/ai/rate-limiter";
import { runQualityChecks, QualityReport } from "./quality-checks";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Дефолтный корпус тестовых документов */
const DEFAULT_CORPUS = [
  "prqZG08LGNO58ld0s_Ajk",  // Курсовая, 2 PNG/JPG
  "ndN3Vip2HhVo6cWoL89hv",  // Дипломный проект, 31 EMF
  // CSAT golden negative tests (2026-04-19) — документы, за которые поставили 1★
  "RIEU4mlQ0urdqG8pS5aBE",  // «Вельмякина — конкурс», 17 таблиц, 354 table-violations
  "uoi7jdZW-nmVLH6WZZ32v",  // «RP_Praktika_Stomatologija», 8 таблиц, 364 table-violations
];

// ── Helpers ──

async function downloadDocument(fileId: string): Promise<Buffer> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const extensions = [".docx", ".pdf", ".txt", ""];

  for (const ext of extensions) {
    const filePath = `${fileId}${ext}`;
    const { data, error } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (!error && data) {
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  throw new Error(`Document not found in Supabase: ${fileId}`);
}

function loadLocalDocument(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

interface TimingInfo {
  parse: number;
  blockMarkup: number;
  analysis: number;
  formatting: number;
  qualityChecks: number;
  total: number;
}

interface BenchResult {
  documentId: string;
  report: QualityReport;
  timing: TimingInfo;
  blockTypes: Record<string, number>;
  violationCount: number;
  autoFixableCount: number;
}

// ── Main pipeline per document ──

async function benchDocument(docId: string): Promise<BenchResult> {
  const t0 = Date.now();

  // 1. Download / load
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📄 Document: ${docId}`);
  console.log("═".repeat(60));

  let buffer: Buffer;
  if (fs.existsSync(docId)) {
    console.log("  Loading from local file...");
    buffer = loadLocalDocument(docId);
  } else {
    console.log("  Downloading from Supabase...");
    buffer = await downloadDocument(docId);
  }
  console.log(`  Size: ${Math.round(buffer.length / 1024)}KB`);

  const rules = mergeWithDefaults({});

  // 2. Parse structure
  console.log("  [1/5] Parsing structure...");
  const t1 = Date.now();
  const docxStructure = await parseDocxStructure(buffer);
  const parseTime = Date.now() - t1;
  console.log(`         ${docxStructure.paragraphs.length} paragraphs (${parseTime}ms)`);

  // 3. AI Block Markup
  console.log("  [2/5] AI block markup...");
  // Сбрасываем rate-limiter перед каждым AI-шагом
  await recordUsage("google-gemini-flash");
  const t2 = Date.now();
  const { paragraphs: enrichedParagraphs, modelId } = await enrichWithBlockMarkup(docxStructure.paragraphs);
  const blockMarkupTime = Date.now() - t2;
  console.log(`         Done (${blockMarkupTime}ms, model: ${modelId || "unknown"})`);

  // Block type distribution
  const blockTypes: Record<string, number> = {};
  enrichedParagraphs.forEach((p) => {
    const bt = p.blockType || "unknown";
    blockTypes[bt] = (blockTypes[bt] || 0) + 1;
  });

  // 4. Analyze
  console.log("  [3/5] Analyzing violations...");
  const t3 = Date.now();
  const analysisResult = await analyzeDocument(buffer, rules, enrichedParagraphs);
  const analysisTime = Date.now() - t3;
  const autoFixable = analysisResult.violations.filter((v) => v.autoFixable).length;
  console.log(`         ${analysisResult.violations.length} violations (${autoFixable} auto-fixable) (${analysisTime}ms)`);

  // 5. Format
  console.log("  [4/5] Full formatting pipeline...");
  // Сбрасываем rate-limiter перед форматированием (AI captions тоже вызывают AI)
  await recordUsage("google-gemini-flash");
  const t4 = Date.now();
  const formattingResult = await formatDocument(buffer, rules, analysisResult.violations, enrichedParagraphs, "admin");
  const formattingTime = Date.now() - t4;
  console.log(`         Done (${formattingTime}ms, ${formattingResult.fixesApplied} fixes applied)`);

  // 6. Quality checks
  console.log("  [5/5] Running quality checks...");
  const t5 = Date.now();
  const report = await runQualityChecks(
    buffer,
    formattingResult.formattedDocument,
    enrichedParagraphs,
    docId,
    {
      margins: rules.document.margins,
      fontFamily: rules.text.fontFamily,
      fontSize: rules.text.fontSize,
      lineSpacing: rules.text.lineSpacing,
      paragraphIndent: rules.text.paragraphIndent,
    }
  );
  const checksTime = Date.now() - t5;

  // 7. Save outputs
  const outDir = "scripts/test-output";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const shortId = docId.length > 20 ? docId.substring(0, 20) : docId;
  fs.writeFileSync(`${outDir}/${shortId}_original.docx`, buffer);
  fs.writeFileSync(`${outDir}/${shortId}_formatted.docx`, formattingResult.formattedDocument);

  const totalTime = Date.now() - t0;

  return {
    documentId: docId,
    report,
    timing: {
      parse: parseTime,
      blockMarkup: blockMarkupTime,
      analysis: analysisTime,
      formatting: formattingTime,
      qualityChecks: checksTime,
      total: totalTime,
    },
    blockTypes,
    violationCount: analysisResult.violations.length,
    autoFixableCount: autoFixable,
  };
}

// ── Console Report ──

function printDocumentReport(result: BenchResult): void {
  const { report, timing, blockTypes } = result;

  // Score with emoji
  const scoreEmoji = report.score >= 90 ? "🟢" : report.score >= 70 ? "🟡" : report.score >= 50 ? "🟠" : "🔴";
  console.log(`\n  ${scoreEmoji} SCORE: ${report.score}/100`);

  // Category scores
  console.log("\n  Категории:");
  for (const [cat, data] of Object.entries(report.categories)) {
    const catEmoji = data.score === 100 ? "✅" : data.score >= 70 ? "⚠️" : "❌";
    console.log(`    ${catEmoji} ${cat.padEnd(15)} ${data.passed}/${data.total} (${data.score}%)`);
  }

  // Failed checks
  const failed = report.checks.filter((c) => !c.passed);
  if (failed.length > 0) {
    console.log(`\n  ❌ Проваленные проверки (${failed.length}):`);
    // Sort by severity
    const sorted = [...failed].sort((a, b) => {
      const order: Record<string, number> = { critical: 0, major: 1, minor: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });
    for (const check of sorted) {
      const sevIcon = check.severity === "critical" ? "🔴" : check.severity === "major" ? "🟠" : "🟡";
      console.log(`    ${sevIcon} [${check.severity}] ${check.name}`);
      console.log(`       Expected: ${check.expected}`);
      console.log(`       Actual:   ${check.actual}`);
      if (check.examples && check.examples.length > 0) {
        for (const ex of check.examples.slice(0, 3)) {
          console.log(`       · ${ex}`);
        }
      }
    }
  }

  // Block types
  const btEntries = Object.entries(blockTypes).sort((a, b) => b[1] - a[1]);
  console.log(`\n  Block types: ${btEntries.map(([k, v]) => `${k}:${v}`).join(", ")}`);

  // Timing
  console.log(`\n  ⏱ Timing: parse=${timing.parse}ms markup=${timing.blockMarkup}ms ` +
    `analysis=${timing.analysis}ms format=${timing.formatting}ms checks=${timing.qualityChecks}ms ` +
    `TOTAL=${timing.total}ms`);
}

function printSummary(results: BenchResult[]): void {
  console.log("\n" + "═".repeat(60));
  console.log("📊 SUMMARY");
  console.log("═".repeat(60));

  const avgScore = Math.round(results.reduce((s, r) => s + r.report.score, 0) / results.length);
  const avgEmoji = avgScore >= 90 ? "🟢" : avgScore >= 70 ? "🟡" : avgScore >= 50 ? "🟠" : "🔴";

  console.log(`\n  ${avgEmoji} Average score: ${avgScore}/100`);
  console.log(`  Documents: ${results.length}`);

  // Per-document scores
  for (const r of results) {
    const shortId = r.documentId.length > 20 ? r.documentId.substring(0, 20) + "..." : r.documentId;
    const emoji = r.report.score >= 90 ? "🟢" : r.report.score >= 70 ? "🟡" : r.report.score >= 50 ? "🟠" : "🔴";
    console.log(`    ${emoji} ${shortId.padEnd(25)} ${r.report.score}/100  (${r.timing.total}ms)`);
  }

  // Aggregate failed checks across documents
  const failedAcross = new Map<string, { name: string; severity: string; docs: number }>();
  for (const r of results) {
    for (const check of r.report.checks) {
      if (!check.passed) {
        const existing = failedAcross.get(check.id) || { name: check.name, severity: check.severity, docs: 0 };
        existing.docs++;
        failedAcross.set(check.id, existing);
      }
    }
  }

  if (failedAcross.size > 0) {
    console.log(`\n  Самые частые проблемы:`);
    const sorted = [...failedAcross.entries()].sort((a, b) => b[1].docs - a[1].docs);
    for (const [id, data] of sorted.slice(0, 10)) {
      const sevIcon = data.severity === "critical" ? "🔴" : data.severity === "major" ? "🟠" : "🟡";
      console.log(`    ${sevIcon} ${data.name} — в ${data.docs}/${results.length} документах`);
    }
  }

  // Total timing
  const totalTime = results.reduce((s, r) => s + r.timing.total, 0);
  console.log(`\n  ⏱ Total bench time: ${Math.round(totalTime / 1000)}s`);
}

// ── Main ──

async function main() {
  // Parse args
  let docIds = process.argv.slice(2);
  if (docIds.length === 0) {
    docIds = DEFAULT_CORPUS;
    console.log(`Using default corpus (${docIds.length} documents)`);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  // AITUNNEL budget исчерпан → форсим Google Gemini native (free tier)
  console.log("Configuring models: blocking AITUNNEL, ensuring Google Gemini is available...");
  await recordUsage("google-gemini-flash"); // Разблокировать Google
  await markModelFailed("aitunnel-gemini-flash");
  await markModelFailed("aitunnel-gemini-flash");
  await markModelFailed("aitunnel-gemini-flash-lite");
  await markModelFailed("aitunnel-gemini-flash-lite");
  await markModelFailed("vercel-gemini-flash");
  await markModelFailed("vercel-gemini-flash");

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║        FORMAT QUALITY BENCH v1.1                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Documents: ${docIds.length}`);
  console.log(`Rules: DEFAULT_GOST_RULES`);
  console.log(`Date: ${new Date().toISOString()}`);

  const results: BenchResult[] = [];

  // Process documents sequentially (AI rate limits)
  for (const docId of docIds) {
    try {
      const result = await benchDocument(docId);
      printDocumentReport(result);
      results.push(result);
    } catch (err) {
      console.error(`\n❌ FAILED: ${docId}`);
      console.error(`   ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (results.length === 0) {
    console.error("\nNo documents processed successfully.");
    process.exit(1);
  }

  // Print summary
  printSummary(results);

  // Save JSON report
  const outDir = "scripts/test-output";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const reportPath = `${outDir}/quality-report-${timestamp}.json`;

  const fullReport = {
    benchVersion: "1.0",
    timestamp: new Date().toISOString(),
    rules: "DEFAULT_GOST_RULES",
    documentCount: results.length,
    averageScore: Math.round(results.reduce((s, r) => s + r.report.score, 0) / results.length),
    results: results.map((r) => ({
      documentId: r.documentId,
      score: r.report.score,
      categories: r.report.categories,
      checks: r.report.checks,
      stats: r.report.stats,
      timing: r.timing,
      blockTypes: r.blockTypes,
      violationCount: r.violationCount,
      autoFixableCount: r.autoFixableCount,
    })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(fullReport, null, 2));
  console.log(`\n📝 Report saved: ${reportPath}`);
  console.log("   (Read this file for Opus Level 2 review)\n");
}

main().catch((err) => {
  console.error("Bench failed:", err);
  process.exit(1);
});
