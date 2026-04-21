// Adapts pipeline-v6 output to the legacy `/api/process-gost` contract so the
// existing frontend (result page, job-store) keeps working unchanged.
//
// Responsibilities:
//   1. Map CheckResult[] → FormattingViolation[] (user-facing rule failures).
//   2. Compute DocumentStatistics from ExtractedDocument + QualityReport.
//   3. Apply trial truncation (same as old formatDocument) + save full versions.

import type { FormattingViolation, DocumentStatistics } from "@/types/formatting-rules";
import { LAVA_CONFIG } from "@/lib/payment/config";
import { truncateDocxToPageLimit } from "@/lib/pipeline/document-analyzer";
import type { PipelineResult } from "./orchestrator";
import type { CheckResult } from "./checker";

export type AccessType = "trial" | "one_time" | "subscription" | "subscription_plus" | "subscription_plus_trial" | "admin" | "none";

const RULE_PATH: Record<string, string> = {
  "page.margins.top": "document.margins.top",
  "page.margins.right": "document.margins.right",
  "page.margins.bottom": "document.margins.bottom",
  "page.margins.left": "document.margins.left",
  "text.fontFamily": "text.fontFamily",
  "text.fontSize": "text.fontSize",
  "text.lineSpacing": "text.lineSpacing",
  "text.firstLineIndent": "text.paragraphIndent",
};

function checkToViolation(c: CheckResult, wasFixed: boolean): FormattingViolation {
  return {
    ruleId: c.id,
    rulePath: RULE_PATH[c.id] ?? c.id,
    message: `${c.name}: ожидается ${c.expected}, фактически ${c.actual}`,
    expected: c.expected,
    actual: c.actual,
    location: { text: c.examples?.[0] },
    autoFixable: wasFixed,
  };
}

function estimatePageCount(text: string, imageCount: number, tableCount: number): number {
  const CHARS_PER_PAGE = 2000;
  const chars = text.length;
  const extra = imageCount + tableCount;
  return Math.max(1, Math.ceil(chars / CHARS_PER_PAGE) + Math.ceil(extra / 3));
}

export interface LegacyAdapterResult {
  markedOriginal: Buffer;
  formattedDocument: Buffer;
  fullMarkedOriginal?: Buffer;
  fullFormattedDocument?: Buffer;
  violations: FormattingViolation[];
  statistics: DocumentStatistics;
  fixesApplied: number;
  wasTruncated: boolean;
  originalPageCount: number;
  pageLimitApplied: number;
}

export async function adaptPipelineV6ToLegacy(
  sourceBuffer: Buffer,
  result: PipelineResult,
  accessType: AccessType,
): Promise<LegacyAdapterResult> {
  // UI ожидает в violations все изначально обнаруженные нарушения; autoFixable=true
  // означает «починили в fix-loop», false — «требует ручной правки».
  const finalPassedIds = new Set(result.finalReport.checks.filter((c) => c.passed).map((c) => c.id));
  const initialFailed = result.initialReport.checks.filter((c) => !c.passed);
  const violations = initialFailed.map((c) => checkToViolation(c, finalPassedIds.has(c.id)));
  const fixesApplied = violations.filter((v) => v.autoFixable).length;

  const text = result.extracted.markdown;
  const imageCount = result.extracted.assets.images.length;
  const tableCount = result.extracted.assets.tables.length;
  const pageCount = estimatePageCount(text, imageCount, tableCount);
  const wordCount = result.extracted.statistics.words;
  const totalCharacters = text.length;
  const charactersWithoutSpaces = text.replace(/\s+/g, "").length;

  let markedOriginal = sourceBuffer;
  let formattedDocument = result.output;
  let wasTruncated = false;
  let originalPageCount = pageCount;
  let pageLimitApplied = pageCount;
  let fullMarkedOriginal: Buffer | undefined;
  let fullFormattedDocument: Buffer | undefined;

  if (accessType === "trial") {
    const truncateOptions = {
      percentLimit: LAVA_CONFIG.freeTrialPercent,
      minPages: LAVA_CONFIG.freeTrialMinPages,
    };
    const [truncatedSource, truncatedFormatted] = await Promise.all([
      truncateDocxToPageLimit(sourceBuffer, 999, truncateOptions),
      truncateDocxToPageLimit(result.output, 999, truncateOptions),
    ]);
    wasTruncated = truncatedSource.wasTruncated || truncatedFormatted.wasTruncated;
    originalPageCount = Math.max(truncatedSource.originalPageCount, truncatedFormatted.originalPageCount);
    pageLimitApplied = truncatedSource.pageLimitApplied;
    if (wasTruncated) {
      fullMarkedOriginal = sourceBuffer;
      fullFormattedDocument = result.output;
    }
    markedOriginal = Buffer.from(truncatedSource.buffer);
    formattedDocument = Buffer.from(truncatedFormatted.buffer);
  }

  const statistics: DocumentStatistics = {
    totalCharacters,
    charactersWithoutSpaces,
    wordCount,
    pageCount: wasTruncated ? pageLimitApplied : pageCount,
    paragraphCount: result.finalReport.stats.paragraphCount,
    imageCount,
    tableCount,
    pipelineTimeMs: result.timings.totalMs,
    ...(wasTruncated && { wasTruncated: true, originalPageCount, pageLimitApplied }),
  };

  return {
    markedOriginal,
    formattedDocument,
    fullMarkedOriginal,
    fullFormattedDocument,
    violations,
    statistics,
    fixesApplied,
    wasTruncated,
    originalPageCount,
    pageLimitApplied,
  };
}
