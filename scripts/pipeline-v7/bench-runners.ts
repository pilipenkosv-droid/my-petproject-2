/**
 * Comparison runners for the v7 bench: pipeline-v6, the legacy upload path,
 * and LibreOffice PDF rendering.
 *
 * PRIVACY: returns ids, counts, timings and rule codes only — never text.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { runPipelineV6 } from "../../src/lib/pipeline-v6/orchestrator";
import { runQualityChecks } from "../../src/lib/pipeline-v6/checker";
import { rulesFromPack } from "../../src/lib/pipeline-v6/orchestrator";
import type { RulePack } from "../../src/lib/pipeline-v6/rule-packs";
import {
  parseDocxStructure,
  enrichWithBlockMarkup,
  analyzeDocument,
} from "../../src/lib/pipeline/document-analyzer";
import { formatDocument } from "../../src/lib/pipeline/document-formatter";
import { mergeWithDefaults } from "../../src/lib/ai/provider";

export const REFERENCE_DOC = path.resolve("scripts/pipeline-v6/spike-pandoc/reference-gost.docx");
export const V6_TIMEOUT_MS = 120_000;

export interface ComparisonRun {
  ok: boolean;
  ms: number;
  output?: Buffer;
  score?: number;
  error?: string;
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: таймаут ${ms} мс`)), ms);
    timer.unref?.();
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, 120);

export async function runV6(input: Buffer, documentId: string): Promise<ComparisonRun> {
  const t0 = Date.now();
  try {
    const r = await withTimeout(
      runPipelineV6(input, {
        documentId,
        referenceDoc: REFERENCE_DOC,
        templateSlug: "gost-7.32",
        rewrite: false,
        fixIterations: 1,
      }),
      V6_TIMEOUT_MS,
      "v6"
    );
    return { ok: true, ms: Date.now() - t0, output: r.output, score: r.finalReport.score };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: message(err) };
  }
}

/**
 * The legacy upload path, wired as src/app/api/confirm-rules/route.ts does.
 * accessType is "subscription", not "trial": a truncated document cannot be
 * compared against the source fingerprint.
 */
export async function runLegacy(
  input: Buffer,
  documentId: string,
  pack: RulePack
): Promise<ComparisonRun> {
  const t0 = Date.now();
  try {
    const rules = mergeWithDefaults({});
    const structure = await parseDocxStructure(input);
    const markup = await enrichWithBlockMarkup(structure.paragraphs);
    const analysis = await analyzeDocument(input, rules, markup.paragraphs);
    const formatted = await formatDocument(
      input,
      rules,
      analysis.violations,
      markup.paragraphs,
      "subscription"
    );
    const output = formatted.fullFormattedDocument ?? formatted.formattedDocument;
    const report = await runQualityChecks(
      input,
      output,
      markup.paragraphs,
      documentId,
      rulesFromPack(pack)
    );
    return { ok: true, ms: Date.now() - t0, output, score: report.score };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: message(err) };
  }
}

export function docxToPdf(docxPath: string, outDir: string): string {
  // soffice открывает всплывающее окно "recovery" если есть lock → --norestore.
  // UpdateFields:true заставляет LibreOffice обновить TOC-поля docx.
  execSync(
    `soffice --headless --norestore --convert-to 'pdf:writer_pdf_Export:UpdateFields=true' "${docxPath}" --outdir "${outDir}"`,
    { stdio: "pipe" }
  );
  const base = path.basename(docxPath, ".docx");
  return path.join(outDir, `${base}.pdf`);
}

export function pdfPageCount(pdfPath: string): number | null {
  try {
    const m = /Pages:\s*(\d+)/.exec(execSync(`pdfinfo "${pdfPath}"`).toString());
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * Renders a buffer to `<outDir>/<name>.pdf`. Returns the page count, or null
 * when LibreOffice refused the file — a corruption signal worth reporting.
 */
export function renderPdf(buf: Buffer, outDir: string, name: string): number | null {
  const workDir = path.join(outDir, ".pdf-work");
  fs.mkdirSync(workDir, { recursive: true });
  const docxPath = path.join(workDir, `${name}.docx`);
  try {
    fs.writeFileSync(docxPath, buf);
    return pdfPageCount(docxToPdf(docxPath, outDir));
  } catch {
    return null;
  } finally {
    fs.rmSync(docxPath, { force: true });
  }
}
