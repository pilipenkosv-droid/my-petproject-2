/**
 * Adapts a pipeline-v7 run to the same legacy contract the v6 adapter produces,
 * so `/api/process-gost` can save and complete a job without knowing which
 * pipeline made the buffer.
 *
 * Two differences from the v6 adapter, both forced by what v7 reports:
 *   1. v7's report keeps only scores and failed check ids, not the full
 *      QualityReport, so the source report is re-run here to get the violation
 *      list and the paragraph/table/image counts the UI shows.
 *   2. There is no mammoth extraction, so the character/word counts come from
 *      the source document's own <w:t> runs.
 */

import JSZip from "jszip";
import type { DocumentStatistics, FormattingViolation } from "@/types/formatting-rules";
import { LAVA_CONFIG } from "@/lib/payment/config";
import { truncateDocxToPageLimit } from "@/lib/pipeline/document-analyzer";
import { runQualityChecks } from "@/lib/pipeline-v6/checker";
import { rulesFromPack } from "@/lib/pipeline-v6/orchestrator";
import { resolveRulePack } from "@/lib/pipeline-v6/rule-packs";
import {
  checkToViolation,
  estimatePageCount,
  type AccessType,
  type LegacyAdapterResult,
} from "@/lib/pipeline-v6/adapter-legacy";
import type { V7Result } from "./report-types";

export type { AccessType, LegacyAdapterResult };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/** Visible text of word/document.xml, runs joined per paragraph. */
async function documentText(buffer: Buffer): Promise<string> {
  let xml: string;
  try {
    const zip = await JSZip.loadAsync(buffer);
    xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  } catch {
    return "";
  }
  const paragraphs = xml.split("<w:p ").join("<w:p>").split("<w:p>");
  return paragraphs
    .map((chunk) =>
      Array.from(chunk.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))
        .map((m) => m[1].replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]))
        .join("")
    )
    .filter((line) => line.length > 0)
    .join("\n");
}

function countWords(text: string): number {
  const parts = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return parts.length;
}

function v7Telemetry(result: V7Result): NonNullable<DocumentStatistics["v7"]> {
  const r = result.report;
  return {
    gatePass: r.gate.pass,
    ...(r.refused && { refused: r.refused }),
    classification: { suspect: r.classification.suspect, histogram: { ...r.classification.histogram } },
    formatMs: r.timings.formatMs,
    finalScoreUndef: r.checker.finalScoreUndef,
    finalScoreRoles: r.checker.finalScoreRoles,
    auxTocInserted: r.aux.tocInserted,
    auxHeadings: r.aux.headings,
    ...(r.aux.tocSkipped && { auxTocSkipped: r.aux.tocSkipped }),
    ...(r.aux.titleBreakSkipped && { auxTitleBreakSkipped: r.aux.titleBreakSkipped }),
  };
}

export async function adaptPipelineV7ToLegacy(
  sourceBuffer: Buffer,
  result: V7Result,
  accessType: AccessType,
): Promise<LegacyAdapterResult> {
  const output = result.output;
  if (!output) throw new Error("v7: гейт не пропустил документ — адаптировать нечего");

  const rules = rulesFromPack(resolveRulePack(result.report.pack));
  const sourceReport = await runQualityChecks(
    sourceBuffer,
    sourceBuffer,
    undefined,
    result.report.documentId,
    rules,
  );
  const stillFailing = new Set(result.report.checker.failed);
  const violations: FormattingViolation[] = sourceReport.checks
    .filter((c) => !c.passed)
    .map((c) => checkToViolation(c, !stillFailing.has(c.id)));
  const fixesApplied = violations.filter((v) => v.autoFixable).length;

  const text = await documentText(sourceBuffer);
  const imageCount = sourceReport.stats.imageCount;
  const tableCount = sourceReport.stats.tableCount;
  const pageCount = estimatePageCount(text, imageCount, tableCount);

  const trimmed = await applyTrialTruncation(sourceBuffer, output, accessType, pageCount);

  const statistics: DocumentStatistics = {
    totalCharacters: text.length,
    charactersWithoutSpaces: text.replace(/\s+/g, "").length,
    wordCount: countWords(text),
    pageCount: trimmed.wasTruncated ? trimmed.pageLimitApplied : pageCount,
    paragraphCount: sourceReport.stats.paragraphCount,
    imageCount,
    tableCount,
    pipelineTimeMs: result.report.timings.totalMs,
    ...(trimmed.wasTruncated && {
      wasTruncated: true,
      originalPageCount: trimmed.originalPageCount,
      pageLimitApplied: trimmed.pageLimitApplied,
    }),
    pipelineVersion: "v7",
    v7: v7Telemetry(result),
  };

  return {
    markedOriginal: trimmed.markedOriginal,
    formattedDocument: trimmed.formattedDocument,
    fullMarkedOriginal: trimmed.fullMarkedOriginal,
    fullFormattedDocument: trimmed.fullFormattedDocument,
    violations,
    statistics,
    fixesApplied,
    wasTruncated: trimmed.wasTruncated,
    originalPageCount: trimmed.originalPageCount,
    pageLimitApplied: trimmed.pageLimitApplied,
  };
}

interface Trimmed {
  markedOriginal: Buffer;
  formattedDocument: Buffer;
  fullMarkedOriginal?: Buffer;
  fullFormattedDocument?: Buffer;
  wasTruncated: boolean;
  originalPageCount: number;
  pageLimitApplied: number;
}

/** Identical to the v6 adapter's trial path: cut both buffers, keep the full ones. */
async function applyTrialTruncation(
  sourceBuffer: Buffer,
  output: Buffer,
  accessType: AccessType,
  pageCount: number,
): Promise<Trimmed> {
  if (accessType !== "trial") {
    return {
      markedOriginal: sourceBuffer,
      formattedDocument: output,
      wasTruncated: false,
      originalPageCount: pageCount,
      pageLimitApplied: pageCount,
    };
  }
  const options = {
    percentLimit: LAVA_CONFIG.freeTrialPercent,
    minPages: LAVA_CONFIG.freeTrialMinPages,
  };
  const [truncatedSource, truncatedFormatted] = await Promise.all([
    truncateDocxToPageLimit(sourceBuffer, 999, options),
    truncateDocxToPageLimit(output, 999, options),
  ]);
  const wasTruncated = truncatedSource.wasTruncated || truncatedFormatted.wasTruncated;
  return {
    markedOriginal: Buffer.from(truncatedSource.buffer),
    formattedDocument: Buffer.from(truncatedFormatted.buffer),
    ...(wasTruncated && { fullMarkedOriginal: sourceBuffer, fullFormattedDocument: output }),
    wasTruncated,
    originalPageCount: Math.max(truncatedSource.originalPageCount, truncatedFormatted.originalPageCount),
    pageLimitApplied: truncatedSource.pageLimitApplied,
  };
}
