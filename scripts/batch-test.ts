/**
 * Batch-тест pipeline на множестве документов.
 * Прогоняет каждый → собирает метрики → выводит сводную таблицу.
 *
 * Запуск: npx tsx scripts/batch-test.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import {
  parseDocxStructure,
  enrichWithBlockMarkup,
  analyzeDocument,
} from "../src/lib/pipeline/document-analyzer";
import { formatDocument } from "../src/lib/pipeline/document-formatter";
import { mergeWithDefaults } from "../src/lib/ai/provider";
import { runQualityChecks } from "./quality-checks";
import type { DocxParagraph } from "../src/lib/pipeline/document-analyzer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OUT_DIR = "scripts/test-output";

// Выборка документов: разные размеры, типы работ
const TEST_DOCS = [
  // Уже протестированные (есть кэш)
  "prqZG08LGNO58ld0s_Aj",   // 567KB — курсовая, таблицы, PNG
  "ndN3Vip2HhVo6cWoL89hv",  // 1566KB — дипломный, EMF
  // Новые — разный размер
  "86OpBxmrx102wRlkDpA8b",  // 2508KB — очень большой
  "oq1fBubCQr_EDRDaYVy1a",  // 761KB — средний
  "Kn-SsQydtBliz5EqEMcg6",  // 873KB — средний
  "vqo4Kqc1bjhk3Sx6jS64W",  // 366KB — средний-маленький
  "3MYh2-buBwxWxotF-fkO0",  // 177KB — маленький
  "himStf70-76irFDtPcqBj",  // 75KB — маленький
];

interface DocResult {
  id: string;
  sizeKB: number;
  paragraphs: number;
  tables: number;
  // AI markup
  aiTimeMs: number;
  chunks: number;
  blockTypes: Record<string, number>;
  unknownPct: number;
  // Formatting
  fmtTimeMs: number;
  fixesApplied: number;
  // Quality
  score: number;
  failedChecks: string[];
  // Errors
  error?: string;
}

async function downloadDoc(id: string): Promise<Buffer> {
  // Сначала проверяем локальный кэш
  const localPaths = [
    path.join(OUT_DIR, `${id}_original.docx`),
    path.join(OUT_DIR, `${id}.docx`),
  ];
  for (const p of localPaths) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  for (const ext of [".docx", ""]) {
    const { data, error } = await supabase.storage.from("documents").download(`${id}${ext}`);
    if (!error && data) {
      const buf = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(path.join(OUT_DIR, `${id}_original.docx`), buf);
      return buf;
    }
  }
  throw new Error(`Not found: ${id}`);
}

async function processDoc(id: string, rules: any): Promise<DocResult> {
  const result: DocResult = {
    id, sizeKB: 0, paragraphs: 0, tables: 0,
    aiTimeMs: 0, chunks: 0, blockTypes: {}, unknownPct: 0,
    fmtTimeMs: 0, fixesApplied: 0, score: 0, failedChecks: [],
  };

  try {
    // Download
    const buffer = await downloadDoc(id);
    result.sizeKB = Math.round(buffer.length / 1024);

    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    result.tables = xml ? (xml.match(/<w:tbl[ >]/g) || []).length : 0;

    // Parse
    const structure = await parseDocxStructure(buffer);
    result.paragraphs = structure.paragraphs.length;

    // AI markup (check cache first)
    const cachePath = path.join(OUT_DIR, `${id}_enriched.json`);
    let enriched: DocxParagraph[];

    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      const cacheMap = new Map(cache.map((c: any) => [c.index, c]));
      for (const p of structure.paragraphs) {
        const c = cacheMap.get(p.index) as any;
        if (c) { p.blockType = c.blockType; p.blockMetadata = c.blockMetadata; }
      }
      enriched = structure.paragraphs;
      result.aiTimeMs = 0; // cached
    } else {
      const t1 = Date.now();
      const aiResult = await enrichWithBlockMarkup(structure.paragraphs);
      result.aiTimeMs = Date.now() - t1;
      enriched = aiResult.paragraphs;

      // Save cache
      const cacheData = enriched.map(p => ({
        index: p.index, blockType: p.blockType, blockMetadata: p.blockMetadata,
      }));
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
    }

    // Block type distribution
    for (const p of enriched) {
      const bt = p.blockType || "unknown";
      result.blockTypes[bt] = (result.blockTypes[bt] || 0) + 1;
    }
    result.unknownPct = ((result.blockTypes["unknown"] || 0) / enriched.length) * 100;

    // Analyze
    const analysis = await analyzeDocument(buffer, rules, enriched);

    // Format
    const t2 = Date.now();
    const fmtResult = await formatDocument(buffer, rules, analysis.violations, enriched, "admin");
    result.fmtTimeMs = Date.now() - t2;
    result.fixesApplied = fmtResult.fixesApplied;

    // Quality
    const qRules = {
      margins: rules.document.margins,
      fontFamily: rules.text.fontFamily,
      fontSize: rules.text.fontSize,
      lineSpacing: rules.text.lineSpacing,
      paragraphIndent: rules.text.paragraphIndent,
    };
    const report = await runQualityChecks(buffer, fmtResult.formattedDocument, enriched, id, qRules);
    result.score = report.score;
    result.failedChecks = report.checks.filter(c => !c.passed).map(c => `[${c.severity}] ${c.name}`);

    // Save formatted
    fs.writeFileSync(path.join(OUT_DIR, `${id}_formatted.docx`), fmtResult.formattedDocument);

  } catch (err: any) {
    result.error = err.message?.substring(0, 100);
  }

  return result;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const rules = mergeWithDefaults({});

  // Можно ограничить набор через BENCH_DOCS=id1,id2
  const selectedDocs = process.env.BENCH_DOCS
    ? process.env.BENCH_DOCS.split(",").map(s => s.trim()).filter(Boolean)
    : TEST_DOCS;

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   BATCH TEST — Formatter v4 Pipeline         ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Documents: ${selectedDocs.length}\n`);

  const results: DocResult[] = [];

  for (let i = 0; i < selectedDocs.length; i++) {
    const id = selectedDocs[i];
    const shortId = id.substring(0, 12) + "...";
    console.log(`[${i + 1}/${selectedDocs.length}] ${shortId}`);

    const result = await processDoc(id, rules);
    results.push(result);

    if (result.error) {
      console.log(`  ❌ ERROR: ${result.error}\n`);
    } else {
      console.log(`  ${result.sizeKB}KB | ${result.paragraphs}p | ${result.tables}t | AI:${result.aiTimeMs}ms | Fmt:${result.fmtTimeMs}ms | Score:${result.score} | Unknown:${result.unknownPct.toFixed(1)}%`);
      if (result.failedChecks.length > 0) {
        for (const fc of result.failedChecks) console.log(`    ⚠ ${fc}`);
      }
      console.log();
    }
  }

  // Сводная таблица
  console.log("\n╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                            SUMMARY TABLE                                      ║");
  console.log("╠══════════════╤═══════╤══════╤═══════╤══════════╤═══════╤═════════╤═════════════╣");
  console.log("║ Doc ID       │ Size  │ Para │ Table │ AI (ms)  │ Fmt   │ Score   │ Unknown%    ║");
  console.log("╠══════════════╪═══════╪══════╪═══════╪══════════╪═══════╪═════════╪═════════════╣");

  for (const r of results) {
    if (r.error) {
      console.log(`║ ${r.id.substring(0, 12).padEnd(12)} │ ERROR: ${r.error.substring(0, 60).padEnd(60)} ║`);
    } else {
      const id = r.id.substring(0, 12).padEnd(12);
      const size = (r.sizeKB + "KB").padEnd(5);
      const para = String(r.paragraphs).padEnd(4);
      const tbl = String(r.tables).padEnd(5);
      const ai = (r.aiTimeMs ? r.aiTimeMs + "" : "cache").padEnd(8);
      const fmt = (r.fmtTimeMs + "ms").padEnd(5);
      const score = String(r.score).padEnd(7);
      const unk = (r.unknownPct.toFixed(1) + "%").padEnd(11);
      console.log(`║ ${id} │ ${size} │ ${para} │ ${tbl} │ ${ai} │ ${fmt} │ ${score} │ ${unk} ║`);
    }
  }
  console.log("╚══════════════╧═══════╧══════╧═══════╧══════════╧═══════╧═════════╧═════════════╝");

  // Агрегаты
  const valid = results.filter(r => !r.error);
  const avgScore = valid.reduce((s, r) => s + r.score, 0) / valid.length;
  const avgUnknown = valid.reduce((s, r) => s + r.unknownPct, 0) / valid.length;
  const avgFmtTime = valid.reduce((s, r) => s + r.fmtTimeMs, 0) / valid.length;
  const totalParas = valid.reduce((s, r) => s + r.paragraphs, 0);

  // Block type totals для оценки tier distribution
  const totalBlockTypes: Record<string, number> = {};
  for (const r of valid) {
    for (const [bt, count] of Object.entries(r.blockTypes)) {
      totalBlockTypes[bt] = (totalBlockTypes[bt] || 0) + count;
    }
  }
  const sortedTypes = Object.entries(totalBlockTypes).sort((a, b) => b[1] - a[1]);

  console.log(`\n  Avg Score:     ${avgScore.toFixed(1)}`);
  console.log(`  Avg Unknown:   ${avgUnknown.toFixed(2)}%`);
  console.log(`  Avg Fmt Time:  ${avgFmtTime.toFixed(0)}ms`);
  console.log(`  Total Paras:   ${totalParas}`);
  console.log(`  Success Rate:  ${valid.length}/${results.length}`);

  // Tier estimation (ADR-008)
  console.log("\n  Block Type Distribution (for tier routing estimation):");
  const tierMap: Record<string, string> = {
    empty: "T0-rule", page_number: "T0-rule",
    body_text: "T1-lite", list_item: "T1-lite",
    heading_1: "T1-lite", heading_2: "T1-lite", heading_3: "T1-lite",
    figure_caption: "T1-lite", table_caption: "T1-lite",
    formula: "T2-flash", quote: "T2-flash", unknown: "T2-flash",
    appendix_title: "T2-flash", appendix_content: "T2-flash",
    toc: "T2-flash", toc_entry: "T2-flash",
    bibliography_entry: "T3-pro", bibliography_title: "T3-pro",
    title_page: "T3-pro", title_page_title: "T3-pro",
    title_page_info: "T3-pro", title_page_header: "T3-pro",
    title_page_footer: "T3-pro", title_page_annotation: "T3-pro",
  };

  const tierCounts: Record<string, number> = {};
  for (const [bt, count] of sortedTypes) {
    const tier = tierMap[bt] || "T2-flash";
    tierCounts[tier] = (tierCounts[tier] || 0) + count;
  }

  for (const [tier, count] of Object.entries(tierCounts).sort()) {
    const pct = ((count / totalParas) * 100).toFixed(1);
    console.log(`    ${tier.padEnd(10)} ${String(count).padEnd(6)} (${pct}%)`);
  }

  // Failed checks aggregate
  const failedAgg: Record<string, number> = {};
  for (const r of valid) {
    for (const fc of r.failedChecks) {
      failedAgg[fc] = (failedAgg[fc] || 0) + 1;
    }
  }
  if (Object.keys(failedAgg).length > 0) {
    console.log("\n  Most Common Failed Checks:");
    for (const [check, count] of Object.entries(failedAgg).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count}/${valid.length} docs: ${check}`);
    }
  }

  // Save report
  const reportPath = path.join(OUT_DIR, `batch-report-${new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19)}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ results, aggregate: { avgScore, avgUnknown, avgFmtTime, totalParas, tierCounts, failedAgg, blockTypeDistribution: totalBlockTypes } }, null, 2));
  console.log(`\n  Report saved: ${reportPath}`);
}

main().catch(err => { console.error("Batch failed:", err); process.exit(1); });
