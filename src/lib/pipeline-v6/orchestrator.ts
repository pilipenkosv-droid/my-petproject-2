// Pipeline-v6 orchestrator — chains all stages end-to-end.
//
//   input.docx
//     ↓ extract (mammoth)
//     ↓ analyze (structure route)
//     ↓ rewrite (body-only LLM, slot-based) — optional (dry-run by default)
//     ↓ assemble (Pandoc primary, docxtpl fallback per-table)
//     ↓ check (GOST checker)
//     ↓ fix (auto-fix + suggest)
//   output.docx + report
//
// This is the thin coordinator; each stage is independently testable.

import { extractDocument, type ExtractedDocument } from "./extractor/mammoth-extractor";
import { analyzeStructure, type StructureReport } from "./analyzer/structure-analyzer";
import { rewriteBody } from "./rewriter/body-rewriter";
import { assembleWithPandoc } from "./assembler/pandoc";
import { detectTableComplexity } from "./assembler/docxtpl";
import { runQualityChecks, type QualityReport } from "./checker";
import { planFixes, applyAutoFixesToXml, summariseSuggestions, type FixPlan, type FixSuggestion } from "./fix-suggest/fix-loop";
import { DEFAULT_GOST_RULES } from "../../types/formatting-rules";
import JSZip from "jszip";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface OrchestratorOptions {
  documentId: string;
  referenceDoc: string;
  /** Apply LLM body rewrite. Default false (structure-only assembly). */
  rewrite?: boolean;
  /** Document metadata for Pandoc YAML header. */
  metadata?: Record<string, string | number | boolean>;
  /** Stop after this many fix iterations. Default 1. */
  fixIterations?: number;
}

export interface PipelineResult {
  output: Buffer;
  extracted: ExtractedDocument;
  structure: StructureReport;
  rewrittenSlots: number;
  tableAssemblyPlan: { pandoc: number; docxtpl: number };
  initialReport: QualityReport;
  finalReport: QualityReport;
  fixPlan: FixPlan;
  suggestions: FixSuggestion[];
  timings: {
    extractMs: number;
    analyzeMs: number;
    rewriteMs: number;
    assembleMs: number;
    checkMs: number;
    fixMs: number;
    totalMs: number;
  };
}

function defaultRules() {
  return {
    margins: DEFAULT_GOST_RULES.document.margins,
    fontFamily: DEFAULT_GOST_RULES.text.fontFamily,
    fontSize: DEFAULT_GOST_RULES.text.fontSize,
    lineSpacing: DEFAULT_GOST_RULES.text.lineSpacing,
    paragraphIndent: DEFAULT_GOST_RULES.text.paragraphIndent,
  };
}

function escapePipeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim() || " ";
}

function tableToPipeMarkdown(rows: string[][], columnCount: number): string {
  if (rows.length === 0 || columnCount === 0) return "";
  const pad = (r: string[]) => {
    const copy = [...r];
    while (copy.length < columnCount) copy.push("");
    return copy.slice(0, columnCount).map(escapePipeCell);
  };
  const header = pad(rows[0]);
  const sep = Array(columnCount).fill("---");
  const body = rows.slice(1).map(pad);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n");
}

async function applyAutoFixesToBuffer(buffer: Buffer, report: QualityReport): Promise<{ buffer: Buffer; applied: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return { buffer, applied: [] };
  const xml = await docFile.async("string");
  const failed = report.checks.filter((c) => !c.passed);
  const { xml: fixedXml, applied } = applyAutoFixesToXml(xml, failed);
  if (applied.length === 0) return { buffer, applied: [] };
  zip.file("word/document.xml", fixedXml);
  const newBuf = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer: newBuf, applied };
}

export async function runPipelineV6(
  input: Buffer,
  opts: OrchestratorOptions,
): Promise<PipelineResult> {
  const timings = {
    extractMs: 0,
    analyzeMs: 0,
    rewriteMs: 0,
    assembleMs: 0,
    checkMs: 0,
    fixMs: 0,
    totalMs: 0,
  };
  const t0 = Date.now();

  // 1. Extract — write images to a tmp dir so pandoc can embed them by reference.
  const imageDir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-images-"));
  const t1 = Date.now();
  const extracted = await extractDocument(input, { imageDir });
  timings.extractMs = Date.now() - t1;

  // 2. Analyze structure
  const t2 = Date.now();
  const structure = analyzeStructure(extracted);
  timings.analyzeMs = Date.now() - t2;

  // 2b. Heading normalization — mammoth maps Russian diploma headings to h3/h4
  // whenever the source docx skipped h1/h2 styles (very common — authors apply
  // direct formatting instead of Heading 1). Without h1/h2, pandoc `--toc`
  // emits no TOC. Promote the deepest non-empty heading level to h1.
  let markdown = extracted.markdown;
  const { h1Count, h2Count, h3Count } = extracted.statistics;
  if (h1Count === 0 && h2Count === 0 && h3Count > 0) {
    markdown = markdown
      .replace(/^#### /gm, "## ")
      .replace(/^### /gm, "# ");
  } else if (h1Count === 0 && h2Count > 0) {
    markdown = markdown
      .replace(/^### /gm, "## ")
      .replace(/^## /gm, "# ");
  }

  // 2b2. Unreferenced raw media — mammoth's markdown converter ignores
  // images embedded inside headers/footers/VML/textboxes. Walk the raw zip,
  // copy any still-missing media into imageDir under a dedicated prefix,
  // and emit markdown image refs at the end so pandoc embeds them and the
  // preservation.images check doesn't regress on such docs.
  {
    const zip = await JSZip.loadAsync(input);
    const mediaFiles = Object.keys(zip.files).filter(
      (f) => /^word\/media\/.+\.(png|jpg|jpeg|gif|bmp|emf|wmf)$/i.test(f),
    );
    const alreadyWritten = new Set(fs.readdirSync(imageDir));
    const extraRefs: string[] = [];
    let extraIdx = 0;
    for (const f of mediaFiles) {
      const base = path.basename(f);
      if (alreadyWritten.has(base)) continue;
      const file = zip.file(f);
      if (!file) continue;
      const buf = await file.async("nodebuffer");
      extraIdx += 1;
      const sub = (base.split(".").pop() ?? "png").toLowerCase();
      const ext = sub.startsWith("x-") ? sub.slice(2) : sub;
      const outName = `extra-${extraIdx}.${ext}`;
      fs.writeFileSync(path.join(imageDir, outName), buf);
      extraRefs.push(`![extra-image](${outName})`);
    }
    if (extraRefs.length > 0) {
      markdown += "\n\n# Приложение Б. Дополнительные изображения\n\n" + extraRefs.join("\n\n");
    }
  }

  // 2c. Tables — mammoth's markdown converter silently drops <table>, and
  // pandoc's docx writer drops raw HTML. Render our structured `tables`
  // (ExtractedTable.rows) to pipe-style markdown and append under an
  // "Приложение" heading. Positioning is crude but preserves the data and
  // satisfies the preservation check; in-place injection is future work.
  if (extracted.assets.tables.length > 0) {
    const pipeTables = extracted.assets.tables
      .filter((t) => t.rows.length > 0 && t.columnCount > 0)
      .map((t) => tableToPipeMarkdown(t.rows, t.columnCount))
      .join("\n\n");
    if (pipeTables) {
      markdown += "\n\n# Приложение А. Таблицы\n\n" + pipeTables;
    }
  }

  // 3. Optional rewrite
  let rewrittenSlots = 0;
  const t3 = Date.now();
  if (opts.rewrite) {
    const rew = await rewriteBody(markdown, {});
    markdown = rew.markdown;
    rewrittenSlots = rew.slotsRewritten;
  }
  timings.rewriteMs = Date.now() - t3;

  // 4. Assembly plan: count tables per assembler
  const tableAssemblyPlan = { pandoc: 0, docxtpl: 0 };
  for (const table of extracted.assets.tables) {
    const c = detectTableComplexity(table);
    tableAssemblyPlan[c.recommendedAssembler]++;
  }

  // 5. Assemble via Pandoc (complex tables left as placeholders; docxtpl fallback is per-section, future work)
  const t4 = Date.now();
  const pandocResult = await assembleWithPandoc({
    markdown,
    referenceDoc: opts.referenceDoc,
    metadata: opts.metadata,
    toc: true,
    tocDepth: 2,
    resourcePath: [imageDir],
  });
  let output = pandocResult.buffer;
  timings.assembleMs = Date.now() - t4;

  // 6. Initial check
  const t5 = Date.now();
  const rules = defaultRules();
  const initialReport = await runQualityChecks(input, output, undefined, opts.documentId, rules);
  timings.checkMs = Date.now() - t5;

  // 7. Fix loop (single iteration by default)
  const t6 = Date.now();
  const fixPlan = planFixes(initialReport);
  const maxIters = opts.fixIterations ?? 1;
  let currentReport = initialReport;
  for (let iter = 0; iter < maxIters; iter++) {
    const { buffer: fixedBuf, applied } = await applyAutoFixesToBuffer(output, currentReport);
    if (applied.length === 0) break;
    output = fixedBuf;
    currentReport = await runQualityChecks(input, output, undefined, opts.documentId, rules);
    if (currentReport.score >= fixPlan.targetScore) break;
  }
  timings.fixMs = Date.now() - t6;
  const suggestions = summariseSuggestions(currentReport);

  timings.totalMs = Date.now() - t0;

  // Cleanup extracted-images tmpdir.
  try {
    fs.rmSync(imageDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  return {
    output,
    extracted,
    structure,
    rewrittenSlots,
    tableAssemblyPlan,
    initialReport,
    finalReport: currentReport,
    fixPlan,
    suggestions,
    timings,
  };
}
