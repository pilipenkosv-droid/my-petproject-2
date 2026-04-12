/**
 * E2E тест formatter v2 pipeline на документе из Supabase Storage.
 *
 * Скачивает документ, прогоняет ПОЛНЫЙ pipeline (AI block-markup → анализ → форматирование),
 * сохраняет результат локально для ручной проверки.
 *
 * Запуск: npx tsx scripts/test-e2e-pipeline.ts <source_document_id>
 *
 * Примеры:
 *   npx tsx scripts/test-e2e-pipeline.ts prqZG08LGNO58ld0s_Ajk  (курсовая, 2 PNG/JPG)
 *   npx tsx scripts/test-e2e-pipeline.ts ndN3Vip2HhVo6cWoL89hv  (дипломный проект, 31 EMF)
 */

import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { parseDocxStructure, enrichWithBlockMarkup, analyzeDocument } from "../src/lib/pipeline/document-analyzer";
import { formatDocument } from "../src/lib/pipeline/document-formatter";
import { DEFAULT_GOST_RULES } from "../src/types/formatting-rules";
import { mergeWithDefaults } from "../src/lib/ai/provider";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
      console.log(`Downloaded: ${filePath} (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);
      return Buffer.from(arrayBuffer);
    }
  }

  throw new Error(`Document not found: ${fileId}`);
}

async function inspectDocx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const imageFiles = Object.keys(zip.files).filter(
    (f) => f.startsWith("word/media/") && /\.(png|jpg|jpeg|gif|bmp|emf|wmf)$/i.test(f)
  );
  const xml = await zip.file("word/document.xml")?.async("string");
  const paraCount = xml ? (xml.match(/<w:p[ >]/g) || []).length : 0;
  const tableCount = xml ? (xml.match(/<w:tbl[ >]/g) || []).length : 0;
  return { imageFiles, paraCount, tableCount };
}

async function main() {
  const fileId = process.argv[2];
  if (!fileId) {
    console.error("Usage: npx tsx scripts/test-e2e-pipeline.ts <source_document_id>");
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing env vars");
    process.exit(1);
  }

  const rules = mergeWithDefaults({});

  console.log("=== E2E Pipeline Test ===");
  console.log(`Document ID: ${fileId}\n`);

  // 1. Download
  console.log("1. Downloading from Supabase Storage...");
  const buffer = await downloadDocument(fileId);
  const { imageFiles, paraCount, tableCount } = await inspectDocx(buffer);
  console.log(`   Paragraphs: ${paraCount}, Tables: ${tableCount}, Images: ${imageFiles.length}`);
  if (imageFiles.length > 0) {
    console.log(`   Image files: ${imageFiles.map(f => f.split("/").pop()).join(", ")}`);
  }

  // 2. Parse structure
  console.log("\n2. Parsing document structure...");
  const t1 = Date.now();
  const docxStructure = await parseDocxStructure(buffer);
  console.log(`   Parsed ${docxStructure.paragraphs.length} paragraphs in ${Date.now() - t1}ms`);

  // 3. AI Block Markup
  console.log("\n3. Running AI block markup...");
  const t2 = Date.now();
  const { paragraphs: enrichedParagraphs, modelId } = await enrichWithBlockMarkup(docxStructure.paragraphs);
  console.log(`   Block markup done in ${Date.now() - t2}ms (model: ${modelId || "unknown"})`);

  // Block type distribution
  const blockTypes = new Map<string, number>();
  enrichedParagraphs.forEach(p => {
    const bt = p.blockType || "unknown";
    blockTypes.set(bt, (blockTypes.get(bt) || 0) + 1);
  });
  console.log("   Block types:", Object.fromEntries([...blockTypes.entries()].sort((a, b) => b[1] - a[1])));

  // First 40 paragraphs with block types (debug title page boundary)
  console.log("\n   First 40 paragraphs:");
  for (let i = 0; i < Math.min(40, enrichedParagraphs.length); i++) {
    const p = enrichedParagraphs[i];
    const text = (p.text || "").substring(0, 80).replace(/\n/g, " ");
    console.log(`   [${i}] ${(p.blockType || "?").padEnd(18)} "${text}"`);
  }

  // 4. Analyze
  console.log("\n4. Analyzing document...");
  const t3 = Date.now();
  const analysisResult = await analyzeDocument(buffer, rules, enrichedParagraphs);
  console.log(`   Found ${analysisResult.violations.length} violations in ${Date.now() - t3}ms`);
  const autoFixable = analysisResult.violations.filter(v => v.autoFixable).length;
  console.log(`   Auto-fixable: ${autoFixable}, Manual: ${analysisResult.violations.length - autoFixable}`);

  // 5. Format (the big test!)
  console.log("\n5. Running full formatting pipeline...");
  console.log("   (includes: structural → text-fixes → caption-numbering → AI-captions → TOC)");
  const t4 = Date.now();
  const formattingResult = await formatDocument(buffer, rules, analysisResult.violations, enrichedParagraphs, "admin");
  const formatTime = Date.now() - t4;
  console.log(`   Formatting done in ${formatTime}ms`);
  console.log(`   Fixes applied: ${formattingResult.fixesApplied}`);

  // 6. Inspect output
  console.log("\n6. Inspecting output document...");
  const outInfo = await inspectDocx(formattingResult.formattedDocument);
  console.log(`   Output paragraphs: ${outInfo.paraCount}, Tables: ${outInfo.tableCount}, Images: ${outInfo.imageFiles.length}`);

  // Check for content preservation
  const sizeDiff = Math.round((formattingResult.formattedDocument.length / buffer.length - 1) * 100);
  console.log(`   Size: ${Math.round(buffer.length / 1024)}KB → ${Math.round(formattingResult.formattedDocument.length / 1024)}KB (${sizeDiff > 0 ? "+" : ""}${sizeDiff}%)`);

  // 7. Save
  const outDir = "scripts/test-output";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const origPath = `${outDir}/${fileId}_original.docx`;
  const fmtPath = `${outDir}/${fileId}_formatted.docx`;
  const markedPath = `${outDir}/${fileId}_marked.docx`;
  fs.writeFileSync(origPath, buffer);
  fs.writeFileSync(fmtPath, formattingResult.formattedDocument);
  fs.writeFileSync(markedPath, formattingResult.markedOriginal);

  console.log(`\n7. Saved to ${outDir}/`);
  console.log(`   Original: ${origPath}`);
  console.log(`   Formatted: ${fmtPath}`);
  console.log(`   Marked: ${markedPath}`);

  // 8. Summary
  console.log("\n=== Summary ===");
  console.log(`Total time: ${Date.now() - t1}ms`);
  console.log(`Violations: ${analysisResult.violations.length} (${autoFixable} auto-fixed)`);
  console.log(`Images preserved: ${imageFiles.length} → ${outInfo.imageFiles.length}`);
  console.log(`Tables preserved: ${tableCount} → ${outInfo.tableCount}`);

  if (outInfo.imageFiles.length < imageFiles.length) {
    console.error("\n⚠️  IMAGES LOST during formatting!");
  }
  if (outInfo.tableCount < tableCount) {
    console.error("\n⚠️  TABLES LOST during formatting!");
  }

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
