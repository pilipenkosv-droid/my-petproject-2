/**
 * Единый CLI-стенд для тестирования formatter pipeline.
 *
 * Прогоняет pipeline → quality checks → golden comparison → выводит вердикт.
 *
 * Запуск:
 *   npx tsx scripts/pipeline-standalone.ts <doc_id_or_path>
 *   npx tsx scripts/pipeline-standalone.ts <doc_id> --skip-ai
 *   npx tsx scripts/pipeline-standalone.ts <doc_id> --golden scripts/test-output/ideal.docx
 *
 * Опции:
 *   --skip-ai     Пропустить AI markup, использовать кэш из {id}_enriched.json
 *   --golden <f>  Сравнить результат с golden/ideal .docx
 *   --no-quality   Пропустить quality checks (только pipeline)
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

// ── CLI parsing ──

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: "",
    skipAi: false,
    goldenPath: "",
    noQuality: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--skip-ai") {
      opts.skipAi = true;
    } else if (args[i] === "--golden" && args[i + 1]) {
      opts.goldenPath = args[++i];
    } else if (args[i] === "--no-quality") {
      opts.noQuality = true;
    } else if (!args[i].startsWith("--")) {
      opts.input = args[i];
    }
  }

  if (!opts.input) {
    console.error(
      "Usage: npx tsx scripts/pipeline-standalone.ts <doc_id_or_path> [--skip-ai] [--golden <file>]"
    );
    process.exit(1);
  }

  return opts;
}

// ── Input resolution ──

function resolveDocId(input: string): string {
  if (fs.existsSync(input)) {
    return path.basename(input, ".docx");
  }
  return input;
}

async function loadInput(input: string): Promise<Buffer> {
  if (fs.existsSync(input)) {
    console.log(`  Source: local file ${input}`);
    return fs.readFileSync(input);
  }

  // Download from Supabase
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE env vars — cannot download from storage");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  for (const ext of [".docx", ".pdf", ".txt", ""]) {
    const filePath = `${input}${ext}`;
    const { data, error } = await supabase.storage.from("documents").download(filePath);
    if (!error && data) {
      const buf = Buffer.from(await data.arrayBuffer());
      console.log(`  Source: Supabase ${filePath} (${Math.round(buf.length / 1024)}KB)`);
      return buf;
    }
  }

  throw new Error(`Document not found: ${input}`);
}

// ── Enriched cache ──

function enrichedCachePath(docId: string): string {
  return path.join(OUT_DIR, `${docId}_enriched.json`);
}

interface EnrichedCache {
  index: number;
  blockType?: string;
  blockMetadata?: DocxParagraph["blockMetadata"];
}

function saveEnriched(docId: string, paragraphs: DocxParagraph[]): void {
  const data: EnrichedCache[] = paragraphs.map((p) => ({
    index: p.index,
    blockType: p.blockType,
    blockMetadata: p.blockMetadata,
  }));
  fs.writeFileSync(enrichedCachePath(docId), JSON.stringify(data, null, 2));
}

/** Загружает кэш AI-разметки и мержит на parsed paragraphs (сохраняя properties/style) */
function mergeEnrichedCache(
  parsed: DocxParagraph[],
  docId: string
): DocxParagraph[] | null {
  const cachePath = enrichedCachePath(docId);
  if (!fs.existsSync(cachePath)) return null;
  const cache: EnrichedCache[] = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  const cacheMap = new Map(cache.map((c) => [c.index, c]));

  for (const p of parsed) {
    const c = cacheMap.get(p.index);
    if (c) {
      p.blockType = c.blockType as any;
      p.blockMetadata = c.blockMetadata;
    }
  }
  return parsed;
}

// ── Golden comparison (inline, no external dep) ──

async function compareWithGolden(
  formattedBuffer: Buffer,
  goldenPath: string
): Promise<{ diffs: number; summary: string }> {
  const { parseDocxXml, getBody, getParagraphsWithPositions, findChild, findChildren, getText, getRuns } =
    await import("../src/lib/xml/docx-xml");

  const goldenBuf = fs.readFileSync(goldenPath);
  const fmtZip = await JSZip.loadAsync(formattedBuffer);
  const goldenZip = await JSZip.loadAsync(goldenBuf);

  const fmtXml = await fmtZip.file("word/document.xml")!.async("string");
  const goldenXml = await goldenZip.file("word/document.xml")!.async("string");

  const fmtBody = getBody(parseDocxXml(fmtXml))!;
  const goldenBody = getBody(parseDocxXml(goldenXml))!;

  const fmtParas = getParagraphsWithPositions(fmtBody);
  const goldenParas = getParagraphsWithPositions(goldenBody);

  const getFullText = (p: any) => {
    let text = "";
    for (const r of getRuns(p)) {
      for (const t of findChildren(r, "w:t")) text += getText(t);
    }
    return text;
  };

  // Align by text
  const goldenTexts = goldenParas.map((p, i) => ({ i, text: getFullText(p.node).trim() })).filter((p) => p.text);
  const fmtTexts = fmtParas.map((p, i) => ({ i, text: getFullText(p.node).trim() })).filter((p) => p.text);

  const used = new Set<number>();
  const matched: { fmtIdx: number; goldenIdx: number }[] = [];

  for (const ft of fmtTexts) {
    const m = goldenTexts.find((gt) => !used.has(gt.i) && gt.text === ft.text);
    if (m) {
      matched.push({ fmtIdx: ft.i, goldenIdx: m.i });
      used.add(m.i);
    }
  }

  // Compare formatting
  let diffs = 0;
  const cats: Record<string, number> = {};

  const getAttr = (node: any, attr: string) =>
    node?.[":@"]?.[`@_w:${attr}`] ?? node?.[":@"]?.[`@_${attr}`];

  for (const pair of matched) {
    const fp = fmtParas[pair.fmtIdx].node;
    const gp = goldenParas[pair.goldenIdx].node;
    const fpPr = findChild(fp, "w:pPr") as any;
    const gpPr = findChild(gp, "w:pPr") as any;

    const fJc = getAttr(fpPr ? findChild(fpPr, "w:jc") : undefined, "val");
    const gJc = getAttr(gpPr ? findChild(gpPr, "w:jc") : undefined, "val");
    if (fJc !== gJc) { diffs++; cats["alignment"] = (cats["alignment"] || 0) + 1; }

    const fInd = getAttr(fpPr ? findChild(fpPr, "w:ind") : undefined, "firstLine");
    const gInd = getAttr(gpPr ? findChild(gpPr, "w:ind") : undefined, "firstLine");
    if (fInd !== gInd) { diffs++; cats["indent"] = (cats["indent"] || 0) + 1; }

    const fSpacing = getAttr(fpPr ? findChild(fpPr, "w:spacing") : undefined, "line");
    const gSpacing = getAttr(gpPr ? findChild(gpPr, "w:spacing") : undefined, "line");
    if (fSpacing !== gSpacing) { diffs++; cats["spacing"] = (cats["spacing"] || 0) + 1; }
  }

  const unmatchedFmt = fmtTexts.length - matched.length;
  const unmatchedGolden = goldenTexts.length - matched.length;

  const parts = [`${matched.length} matched, ${diffs} formatting diffs`];
  if (unmatchedFmt > 0) parts.push(`${unmatchedFmt} only-in-formatted`);
  if (unmatchedGolden > 0) parts.push(`${unmatchedGolden} only-in-golden`);

  const catStr = Object.entries(cats).map(([k, v]) => `${k}:${v}`).join(", ");
  if (catStr) parts.push(`(${catStr})`);

  return { diffs: diffs + unmatchedFmt + unmatchedGolden, summary: parts.join(", ") };
}

// ── Main ──

async function main() {
  const opts = parseArgs();
  const docId = resolveDocId(opts.input);
  const rules = mergeWithDefaults({});

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   FORMATTER v4 — STANDALONE TEST BENCH   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`  Doc ID: ${docId}`);
  console.log(`  Skip AI: ${opts.skipAi}`);
  if (opts.goldenPath) console.log(`  Golden: ${opts.goldenPath}`);
  console.log();

  // 1. Load input
  console.log("1. Loading document...");
  const buffer = await loadInput(opts.input);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  const paraCount = xml ? (xml.match(/<w:p[ >]/g) || []).length : 0;
  const tableCount = xml ? (xml.match(/<w:tbl[ >]/g) || []).length : 0;
  console.log(`  Paragraphs: ${paraCount}, Tables: ${tableCount}\n`);

  // 2. Parse
  console.log("2. Parsing structure...");
  const t1 = Date.now();
  const structure = await parseDocxStructure(buffer);
  console.log(`  ${structure.paragraphs.length} paragraphs in ${Date.now() - t1}ms\n`);

  // 3. AI block markup (or cache)
  let enrichedParagraphs: DocxParagraph[];
  let modelId = "cached";

  if (opts.skipAi) {
    console.log("3. Loading cached AI markup...");
    const merged = mergeEnrichedCache(structure.paragraphs, docId);
    if (!merged) {
      console.error(`   No cache found at ${enrichedCachePath(docId)}`);
      console.error("   Run without --skip-ai first to create cache.");
      process.exit(1);
    }
    enrichedParagraphs = merged;
    console.log(`  Loaded ${enrichedParagraphs.length} paragraphs from cache\n`);
  } else {
    console.log("3. Running AI block markup...");
    const t2 = Date.now();
    const result = await enrichWithBlockMarkup(structure.paragraphs);
    enrichedParagraphs = result.paragraphs;
    modelId = result.modelId || "unknown";
    console.log(`  Done in ${Date.now() - t2}ms (model: ${modelId})`);

    // Сохраняем кэш для --skip-ai
    saveEnriched(docId, enrichedParagraphs);
    console.log(`  Cache saved: ${enrichedCachePath(docId)}\n`);
  }

  // Block type distribution
  const blockTypes = new Map<string, number>();
  for (const p of enrichedParagraphs) {
    const bt = p.blockType || "unknown";
    blockTypes.set(bt, (blockTypes.get(bt) || 0) + 1);
  }
  const sorted = [...blockTypes.entries()].sort((a, b) => b[1] - a[1]);
  console.log("  Block types:", Object.fromEntries(sorted));
  const unknownPct = ((blockTypes.get("unknown") || 0) / enrichedParagraphs.length * 100).toFixed(1);
  console.log(`  Unknown: ${unknownPct}%\n`);

  // 4. Analyze
  console.log("4. Analyzing document...");
  const t3 = Date.now();
  const analysis = await analyzeDocument(buffer, rules, enrichedParagraphs);
  const autoFixable = analysis.violations.filter((v) => v.autoFixable).length;
  console.log(`  ${analysis.violations.length} violations (${autoFixable} auto-fixable) in ${Date.now() - t3}ms\n`);

  // 5. Format
  console.log("5. Running formatter pipeline...");
  const t4 = Date.now();
  const result = await formatDocument(buffer, rules, analysis.violations, enrichedParagraphs, "admin");
  const fmtTime = Date.now() - t4;
  console.log(`  ${result.fixesApplied} fixes applied in ${fmtTime}ms\n`);

  // Save output
  const fmtPath = path.join(OUT_DIR, `${docId}_formatted.docx`);
  const origPath = path.join(OUT_DIR, `${docId}_original.docx`);
  fs.writeFileSync(fmtPath, result.formattedDocument);
  fs.writeFileSync(origPath, buffer);

  // 6. Quality checks
  let qualityScore = 0;
  if (!opts.noQuality) {
    console.log("6. Running quality checks...");
    const qRules = {
      margins: rules.document.margins,
      fontFamily: rules.text.fontFamily,
      fontSize: rules.text.fontSize,
      lineSpacing: rules.text.lineSpacing,
      paragraphIndent: rules.text.paragraphIndent,
    };
    const report = await runQualityChecks(buffer, result.formattedDocument, enrichedParagraphs, docId, qRules);
    qualityScore = report.score;

    // Сохраняем отчёт
    const reportPath = path.join(OUT_DIR, `${docId}_quality.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Вывод по категориям
    for (const [cat, data] of Object.entries(report.categories)) {
      const d = data as { passed: number; total: number; score: number };
      const icon = d.score === 100 ? "✓" : "✗";
      console.log(`  ${icon} ${cat}: ${d.passed}/${d.total} (${d.score})`);
    }

    // Показываем failed checks
    const failed = report.checks.filter((c) => !c.passed);
    if (failed.length > 0) {
      console.log(`\n  Failed checks (${failed.length}):`);
      for (const c of failed) {
        console.log(`    [${c.severity}] ${c.name}: expected=${c.expected}, actual=${c.actual}`);
      }
    }
    console.log();
  }

  // 7. Golden comparison
  let goldenDiffs = -1;
  if (opts.goldenPath) {
    console.log("7. Comparing with golden...");
    const golden = await compareWithGolden(result.formattedDocument, opts.goldenPath);
    goldenDiffs = golden.diffs;
    console.log(`  ${golden.summary}\n`);
  }

  // ── Summary ──
  const totalTime = Date.now() - t1;
  console.log("╔══════════════════════════════════════════╗");
  console.log("║              SUMMARY                     ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Quality Score: ${String(qualityScore).padEnd(25)}║`);
  console.log(`║  Fixes Applied: ${String(result.fixesApplied).padEnd(25)}║`);
  console.log(`║  Format Time:   ${(fmtTime + "ms").padEnd(25)}║`);
  console.log(`║  Total Time:    ${(totalTime + "ms").padEnd(25)}║`);
  console.log(`║  Unknown Types: ${(unknownPct + "%").padEnd(25)}║`);
  console.log(`║  Model:         ${modelId.padEnd(25).substring(0, 25)}║`);
  if (goldenDiffs >= 0) {
    const gLabel = goldenDiffs === 0 ? "MATCH" : `${goldenDiffs} diffs`;
    console.log(`║  Golden:        ${gLabel.padEnd(25)}║`);
  }
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n  Output: ${fmtPath}`);
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
