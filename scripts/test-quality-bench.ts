/**
 * Quality Bench — полный цикл тестирования форматора
 *
 * 1. Скачивает документ из Supabase
 * 2. Прогоняет полный pipeline (AI block-markup + formatting)
 * 3. Глубоко инспектирует результат на XML-уровне
 * 4. Выводит структурированный отчёт (JSON) для проверки агентом
 *
 * Запуск: npx tsx scripts/test-quality-bench.ts <source_document_id>
 */

import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Стенд использует ТОЛЬКО AITUNNEL — остальные провайдеры отключаем,
// чтобы не тратить лимиты бесплатных API и не засорять логи 429-ми.
delete process.env.GEMINI_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.CEREBRAS_API_KEY;

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import {
  parseDocxStructure,
  enrichWithBlockMarkup,
  analyzeDocument,
} from "../src/lib/pipeline/document-analyzer";
import { formatDocument } from "../src/lib/pipeline/document-formatter";
import { mergeWithDefaults } from "../src/lib/ai/provider";
import {
  type OrderedXmlNode,
  parseDocxXml,
  getBody,
  getParagraphsWithPositions,
  findChild,
  findChildren,
  getText,
  children,
} from "../src/lib/xml/docx-xml";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ── Helpers ──

async function getDocument(fileId: string): Promise<Buffer> {
  // Try local cache first
  const localPath = `scripts/test-output/${fileId}_original.docx`;
  if (fs.existsSync(localPath)) {
    console.log(`Using cached: ${localPath}`);
    return fs.readFileSync(localPath);
  }

  // Also try as direct file path
  if (fs.existsSync(fileId)) {
    console.log(`Using local file: ${fileId}`);
    return fs.readFileSync(fileId);
  }

  // Download from Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  for (const ext of [".docx", ""]) {
    const path = `${fileId}${ext}`;
    const { data, error } = await supabase.storage.from("documents").download(path);
    if (!error && data) {
      const buf = Buffer.from(await data.arrayBuffer());
      // Cache locally
      const outDir = "scripts/test-output";
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(`${outDir}/${fileId}_original.docx`, buf);
      return buf;
    }
  }
  throw new Error(`Document not found: ${fileId}`);
}

function getParagraphText(node: OrderedXmlNode): string {
  const runs = findChildren(node, "w:r");
  let text = "";
  for (const run of runs) {
    for (const t of findChildren(run, "w:t")) {
      text += getText(t);
    }
  }
  return text;
}

// ── Deep DOCX Inspection ──

interface QualityReport {
  meta: {
    fileId: string;
    totalParagraphs: number;
    totalTables: number;
    totalImages: number;
    fileSizeKB: number;
    pipelineTimeMs: number;
  };
  blockMarkup: {
    model: string;
    typeCounts: Record<string, number>;
    unknownCount: number;
    unknownPercent: number;
    headingCount: number;
    first50Paragraphs: { index: number; type: string; text: string }[];
  };
  checks: {
    name: string;
    status: "PASS" | "FAIL" | "WARN";
    details: string;
  }[];
  tocCheck: {
    hasTocHeading: boolean;
    hasTocFieldCode: boolean;
    tocPosition: number | null;
    headingsWithOutlineLvl: number;
    headingsTotal: number;
    headingsWithPStyle: string[];
  };
  listCheck: {
    hasNumberingXml: boolean;
    paragraphsWithNumPr: number;
    uniqueNumIds: number[];
    listGroupCount: number;
  };
  landscapeCheck: {
    landscapeSections: number;
    wideTables: number;
    totalTables: number;
  };
  bibliographyCheck: {
    entriesCount: number;
    nbspCount: number;
    entriesWithNbsp: number;
  };
  contentPreservation: {
    originalCharCount: number;
    formattedCharCount: number;
    lossPercent: number;
    originalParaCount: number;
    formattedParaCount: number;
  };
}

async function deepInspect(
  buffer: Buffer,
  enrichedParagraphs: { index: number; blockType?: string; text: string }[]
): Promise<Omit<QualityReport, "meta" | "blockMarkup">> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("No document.xml");

  const parsed = parseDocxXml(xml);
  const body = getBody(parsed);
  if (!body) throw new Error("No body");

  const bc = children(body);
  const paragraphs = getParagraphsWithPositions(body);
  const checks: QualityReport["checks"] = [];

  // ── TOC Check ──
  let hasTocHeading = false;
  let hasTocFieldCode = false;
  let tocPosition: number | null = null;
  let headingsWithOutlineLvl = 0;
  let headingsTotal = 0;
  const headingsWithPStyle: string[] = [];

  for (const { node, bodyIndex } of paragraphs) {
    const text = getParagraphText(node).trim();
    if (/^СОДЕРЖАНИЕ$|^ОГЛАВЛЕНИЕ$/i.test(text)) {
      hasTocHeading = true;
      tocPosition = bodyIndex;
    }
    // Check for TOC field code
    const runs = findChildren(node, "w:r");
    for (const run of runs) {
      const instrText = findChild(run, "w:instrText");
      if (instrText && getText(instrText).includes("TOC")) {
        hasTocFieldCode = true;
      }
      const fldChar = findChild(run, "w:fldChar");
      if (fldChar) {
        // Field char exists
      }
    }

    // Check heading styles
    const pPr = findChild(node, "w:pPr");
    if (pPr) {
      const outlineLvl = findChild(pPr, "w:outlineLvl");
      const pStyle = findChild(pPr, "w:pStyle");
      const styleVal = pStyle?.[":@"]?.["@_w:val"] as string | undefined;
      if (styleVal && /^Heading\d$/i.test(styleVal)) {
        headingsTotal++;
        headingsWithPStyle.push(`[${bodyIndex}] ${styleVal}: "${text.slice(0, 60)}"`);
        if (outlineLvl) headingsWithOutlineLvl++;
      }
      if (outlineLvl && !styleVal?.startsWith("Heading")) {
        // outlineLvl on non-heading — potential TOC garbage
        checks.push({
          name: "outlineLvl on non-heading",
          status: "WARN",
          details: `bodyIndex ${bodyIndex}: outlineLvl without Heading style, text="${text.slice(0, 60)}"`,
        });
      }
    }
  }

  if (hasTocHeading && hasTocFieldCode) {
    checks.push({ name: "TOC", status: "PASS", details: `TOC heading + field code at bodyIndex ${tocPosition}` });
  } else if (hasTocHeading && !hasTocFieldCode) {
    checks.push({ name: "TOC", status: "WARN", details: "TOC heading found but no field code — TOC won't auto-update" });
  } else {
    checks.push({ name: "TOC", status: "FAIL", details: "No TOC heading found in formatted document" });
  }

  // ── List Check ──
  let hasNumberingXml = false;
  const numberingXml = await zip.file("word/numbering.xml")?.async("string");
  if (numberingXml) hasNumberingXml = true;

  let paragraphsWithNumPr = 0;
  const numIds = new Set<number>();
  for (const { node } of paragraphs) {
    const pPr = findChild(node, "w:pPr");
    if (pPr) {
      const numPr = findChild(pPr, "w:numPr");
      if (numPr) {
        paragraphsWithNumPr++;
        const numId = findChild(numPr, "w:numId");
        const val = numId?.[":@"]?.["@_w:val"];
        if (val) numIds.add(parseInt(String(val)));
      }
    }
  }

  if (paragraphsWithNumPr > 0) {
    checks.push({
      name: "Lists",
      status: numIds.size > 1 ? "PASS" : "WARN",
      details: `${paragraphsWithNumPr} list paragraphs, ${numIds.size} unique numIds: [${[...numIds].join(",")}]`,
    });
  } else {
    checks.push({ name: "Lists", status: "WARN", details: "No list paragraphs (w:numPr) found" });
  }

  // ── Landscape Check ──
  let landscapeSections = 0;
  let totalTables = 0;
  let wideTables = 0;
  const PORTRAIT_AVAIL = 9355;

  for (const node of bc) {
    if ("w:tbl" in node) {
      totalTables++;
      const grid = findChild(node, "w:tblGrid");
      if (grid) {
        const cols = findChildren(grid, "w:gridCol");
        let totalW = 0;
        for (const c of cols) {
          totalW += parseInt(String(c[":@"]?.["@_w:w"] || "0"));
        }
        if (totalW > PORTRAIT_AVAIL || cols.length >= 7) wideTables++;
      }
    }
    if ("w:p" in node) {
      const pPr = findChild(node, "w:pPr");
      if (pPr) {
        const sectPr = findChild(pPr, "w:sectPr");
        if (sectPr) {
          const pgSz = findChild(sectPr, "w:pgSz");
          const orient = pgSz?.[":@"]?.["@_w:orient"];
          if (orient === "landscape") landscapeSections++;
        }
      }
    }
  }

  if (wideTables > 0 && landscapeSections > 0) {
    checks.push({
      name: "Landscape",
      status: "PASS",
      details: `${landscapeSections} landscape sections for ${wideTables} wide tables (of ${totalTables} total)`,
    });
  } else if (wideTables > 0 && landscapeSections === 0) {
    checks.push({
      name: "Landscape",
      status: "FAIL",
      details: `${wideTables} wide tables but NO landscape sections`,
    });
  } else {
    checks.push({
      name: "Landscape",
      status: "PASS",
      details: `No wide tables detected (${totalTables} total)`,
    });
  }

  // ── Bibliography NBSP Check ──
  const NBSP = "\u00A0";
  let biblioEntries = 0;
  let nbspCount = 0;
  let entriesWithNbsp = 0;

  // Ищем библиографию: по AI-разметке или по текстовому паттерну (после заголовка)
  let inBiblio = false;
  for (const { node, paragraphIndex } of paragraphs) {
    const enriched = enrichedParagraphs.find((p) => p.index === paragraphIndex);
    const text = getParagraphText(node);
    const trimmed = text.trim();

    // Detect bibliography section start
    if (enriched?.blockType === "bibliography_title" ||
        /^(?:список\s+(?:использованных?\s+)?(?:источников|литературы)|библиограф)/i.test(trimmed)) {
      inBiblio = true;
      continue;
    }

    const isBiblioEntry = enriched?.blockType === "bibliography_entry" ||
      (inBiblio && /^\d+\.\s+[А-ЯA-Z]/.test(trimmed));

    if (!isBiblioEntry) {
      // Exit bibliography on non-entry paragraphs (headings, etc.)
      if (inBiblio && trimmed && !/^\d+\./.test(trimmed) && !trimmed.startsWith("[")) {
        inBiblio = false;
      }
      continue;
    }

    biblioEntries++;
    const hasNbsp = text.includes(NBSP);
    if (hasNbsp) {
      entriesWithNbsp++;
      nbspCount += (text.match(new RegExp(NBSP, "g")) || []).length;
    }
  }

  if (biblioEntries > 0) {
    const pct = Math.round((entriesWithNbsp / biblioEntries) * 100);
    checks.push({
      name: "Bibliography NBSP",
      status: pct >= 50 ? "PASS" : "WARN",
      details: `${entriesWithNbsp}/${biblioEntries} entries have NBSP (${nbspCount} total NBSP chars)`,
    });
  }

  // ── Content Preservation ──
  let formattedCharCount = 0;
  let formattedParaCount = paragraphs.length;
  for (const { node } of paragraphs) {
    formattedCharCount += getParagraphText(node).replace(/\s/g, "").length;
  }

  return {
    checks,
    tocCheck: {
      hasTocHeading,
      hasTocFieldCode,
      tocPosition,
      headingsWithOutlineLvl,
      headingsTotal,
      headingsWithPStyle,
    },
    listCheck: {
      hasNumberingXml,
      paragraphsWithNumPr,
      uniqueNumIds: [...numIds],
      listGroupCount: numIds.size,
    },
    landscapeCheck: {
      landscapeSections,
      wideTables,
      totalTables,
    },
    bibliographyCheck: {
      entriesCount: biblioEntries,
      nbspCount,
      entriesWithNbsp,
    },
    contentPreservation: {
      originalCharCount: 0, // filled by caller
      formattedCharCount,
      lossPercent: 0, // filled by caller
      originalParaCount: 0,
      formattedParaCount,
    },
  };
}

// ── Main ──

async function main() {
  const fileId = process.argv[2];
  if (!fileId) {
    console.error("Usage: npx tsx scripts/test-quality-bench.ts <source_document_id>");
    console.error("\nExamples:");
    console.error("  npx tsx scripts/test-quality-bench.ts ndN3Vip2HhVo6cWoL89hv");
    console.error("  npx tsx scripts/test-quality-bench.ts prqZG08LGNO58ld0s_Ajk");
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const rules = mergeWithDefaults({});
  const startTime = Date.now();

  console.log("=== Quality Bench ===");
  console.log(`Document: ${fileId}\n`);

  // 1. Download
  const buffer = await getDocument(fileId);
  console.log(`Downloaded: ${Math.round(buffer.length / 1024)}KB`);

  // 2. Parse + AI markup
  console.log("\nRunning AI block markup...");
  const t2 = Date.now();
  const docxStructure = await parseDocxStructure(buffer);
  const { paragraphs: enrichedParagraphs, modelId } = await enrichWithBlockMarkup(
    docxStructure.paragraphs
  );
  const markupTime = Date.now() - t2;
  console.log(`Block markup: ${markupTime}ms (model: ${modelId || "unknown"})`);

  // Block type stats
  const typeCounts: Record<string, number> = {};
  let unknownCount = 0;
  let headingCount = 0;
  for (const p of enrichedParagraphs) {
    const bt = p.blockType || "unknown";
    typeCounts[bt] = (typeCounts[bt] || 0) + 1;
    if (bt === "unknown") unknownCount++;
    if (bt.startsWith("heading_")) headingCount++;
  }
  console.log(`Types: ${JSON.stringify(typeCounts)}`);
  console.log(`Unknown: ${unknownCount}/${enrichedParagraphs.length} (${Math.round((unknownCount / enrichedParagraphs.length) * 100)}%)`);

  // 3. Analyze + Format
  console.log("\nRunning full formatting pipeline...");
  const t3 = Date.now();
  const analysis = await analyzeDocument(buffer, rules, enrichedParagraphs);
  const result = await formatDocument(buffer, rules, analysis.violations, enrichedParagraphs, "admin");
  const formatTime = Date.now() - t3;
  console.log(`Formatting: ${formatTime}ms, fixes: ${result.fixesApplied}`);

  // 4. Deep inspection
  console.log("\nDeep inspecting formatted document...");
  const inspection = await deepInspect(
    result.formattedDocument,
    enrichedParagraphs.map((p) => ({ index: p.index, blockType: p.blockType, text: p.text }))
  );

  // Original char count for content preservation
  let originalCharCount = 0;
  for (const p of enrichedParagraphs) {
    originalCharCount += (p.text || "").replace(/\s/g, "").length;
  }
  inspection.contentPreservation.originalCharCount = originalCharCount;
  inspection.contentPreservation.originalParaCount = enrichedParagraphs.length;
  if (originalCharCount > 0) {
    inspection.contentPreservation.lossPercent = Math.round(
      ((originalCharCount - inspection.contentPreservation.formattedCharCount) / originalCharCount) * 100
    );
  }

  // Content preservation check
  if (inspection.contentPreservation.lossPercent > 20) {
    inspection.checks.push({
      name: "Content Preservation",
      status: "FAIL",
      details: `Lost ${inspection.contentPreservation.lossPercent}% of characters`,
    });
  } else if (inspection.contentPreservation.lossPercent > 5) {
    inspection.checks.push({
      name: "Content Preservation",
      status: "WARN",
      details: `Lost ${inspection.contentPreservation.lossPercent}% of characters`,
    });
  } else {
    inspection.checks.push({
      name: "Content Preservation",
      status: "PASS",
      details: `${inspection.contentPreservation.formattedCharCount} chars (${inspection.contentPreservation.lossPercent}% change)`,
    });
  }

  // 5. Build full report
  const report: QualityReport = {
    meta: {
      fileId,
      totalParagraphs: enrichedParagraphs.length,
      totalTables: inspection.landscapeCheck.totalTables,
      totalImages: 0,
      fileSizeKB: Math.round(result.formattedDocument.length / 1024),
      pipelineTimeMs: Date.now() - startTime,
    },
    blockMarkup: {
      model: modelId || "unknown",
      typeCounts,
      unknownCount,
      unknownPercent: Math.round((unknownCount / enrichedParagraphs.length) * 100),
      headingCount,
      first50Paragraphs: enrichedParagraphs.slice(0, 50).map((p) => ({
        index: p.index,
        type: p.blockType || "unknown",
        text: (p.text || "").slice(0, 100),
      })),
    },
    ...inspection,
  };

  // 6. Save
  const outDir = "scripts/test-output";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const fmtPath = `${outDir}/${fileId}_formatted.docx`;
  const reportPath = `${outDir}/${fileId}_quality_report.json`;
  fs.writeFileSync(fmtPath, result.formattedDocument);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // 7. Print summary
  console.log("\n" + "=".repeat(60));
  console.log("QUALITY REPORT");
  console.log("=".repeat(60));

  for (const check of report.checks) {
    const icon = check.status === "PASS" ? "OK" : check.status === "FAIL" ? "FAIL" : "WARN";
    console.log(`  [${icon}] ${check.name}: ${check.details}`);
  }

  console.log(`\nBlock markup: ${report.blockMarkup.unknownPercent}% unknown (target: <5%)`);
  console.log(`Headings: ${report.blockMarkup.headingCount} detected`);
  console.log(`TOC: heading=${report.tocCheck.hasTocHeading}, field=${report.tocCheck.hasTocFieldCode}`);
  console.log(`Lists: ${report.listCheck.paragraphsWithNumPr} items, ${report.listCheck.listGroupCount} groups`);
  console.log(`Landscape: ${report.landscapeCheck.landscapeSections} sections`);
  console.log(`Bibliography: ${report.bibliographyCheck.entriesCount} entries, ${report.bibliographyCheck.entriesWithNbsp} with NBSP`);
  console.log(`Content: ${report.contentPreservation.lossPercent}% change`);
  console.log(`\nTime: ${report.meta.pipelineTimeMs}ms`);
  console.log(`\nSaved:`);
  console.log(`  ${fmtPath}`);
  console.log(`  ${reportPath}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Quality bench failed:", err);
  process.exit(1);
});
