/**
 * Форматирование документа по правилам из методички — общая логика роута и
 * воркера (легаси-цепочка: parse → markup → analyze → format).
 *
 * Модуль не импортирует next/*: его исполняет и /api/confirm-rules (инлайн),
 * и внешний воркер на обычном Node (ADR-016, фаза 2).
 */

import {
  analyzeDocument,
  parseDocxStructure,
  enrichWithBlockMarkup,
} from "@/lib/pipeline/document-analyzer";
import { formatDocument, type AccessType } from "@/lib/pipeline/document-formatter";
import { saveResultFile, saveFullVersionFile } from "@/lib/storage/file-storage";
import { completeJob, updateJob, updateJobProgress } from "@/lib/storage/job-store";
import type { DocumentStatistics, FormattingRules } from "@/types/formatting-rules";
import { JobAlreadyTerminalError, type ProgressReporter } from "./gost-job";

export interface ConfirmRulesJobResult {
  statistics: DocumentStatistics;
  violationsCount: number;
}

export interface ConfirmRulesJobOptions {
  /** Абсолютный дедлайн AI-разметки блоков (Date.now() + бюджет). */
  deadline: number;
  onProgress?: ProgressReporter;
  /** Статистика, записанная этапом разбора методички: поля rules* не затираем. */
  priorStatistics?: DocumentStatistics;
}

type FormattingResult = Awaited<ReturnType<typeof formatDocument>>;
type MarkupResult = Awaited<ReturnType<typeof enrichWithBlockMarkup>>;

interface PipelineOutput {
  analysis: Awaited<ReturnType<typeof analyzeDocument>>;
  formatting: FormattingResult;
  markup: MarkupResult;
  pipelineTimeMs: number;
}

/** Легаси-цепочка: разбор структуры → AI-разметка блоков → анализ → форматирование. */
async function runLegacyPipeline(input: {
  jobId: string;
  sourceBuffer: Buffer;
  rules: FormattingRules;
  accessType: AccessType;
  deadline: number;
  report: ProgressReporter;
}): Promise<PipelineOutput> {
  const { jobId, sourceBuffer, rules, accessType, report } = input;

  await report("analyzing", 55, "AI-разметка блоков документа");
  const pipelineStart = Date.now();
  const docxStructure = await parseDocxStructure(sourceBuffer);
  const markup = await enrichWithBlockMarkup(docxStructure.paragraphs, {
    deadline: input.deadline,
  });

  if (markup.modelId) {
    updateJob(jobId, { modelId: markup.modelId }).catch(() => {});
  }

  await report("analyzing", 65, "Проверка документа на соответствие требованиям");
  const analysis = await analyzeDocument(sourceBuffer, rules, markup.paragraphs);

  await report("formatting", 75, "Применение форматирования через XML");

  // Для trial — обрезка до 50% документа происходит ПОСЛЕ форматирования
  const formatting = await formatDocument(
    sourceBuffer,
    rules,
    analysis.violations,
    markup.paragraphs,
    accessType
  );

  return { analysis, formatting, markup, pipelineTimeMs: Date.now() - pipelineStart };
}

export async function processConfirmRulesJob(
  jobId: string,
  sourceBuffer: Buffer,
  rules: FormattingRules,
  accessType: AccessType,
  options: ConfirmRulesJobOptions
): Promise<ConfirmRulesJobResult> {
  const report: ProgressReporter =
    options.onProgress ??
    (async (status, progress, message) => {
      await updateJobProgress(jobId, status, progress, message);
    });

  const pipeline = await runLegacyPipeline({
    jobId,
    sourceBuffer,
    rules,
    accessType,
    deadline: options.deadline,
    report,
  });

  await report("formatting", 90, "Сохранение результатов");
  const hasFullVersion = await saveResults(jobId, pipeline.formatting);

  const statistics = mergeStatistics({ ...pipeline, prior: options.priorStatistics });

  const finished = await completeJob(jobId, {
    markedOriginalId: `${jobId}_original`,
    formattedDocumentId: `${jobId}_formatted`,
    violations: pipeline.analysis.violations,
    statistics,
    rules,
    ...(hasFullVersion && { hasFullVersion: true }),
  });
  if (!finished) throw new JobAlreadyTerminalError(jobId);

  return { statistics, violationsCount: pipeline.analysis.violations.length };
}

/** Полные версии нужны для разблокировки после оплаты (trial с обрезкой). */
async function saveResults(
  jobId: string,
  formattingResult: FormattingResult
): Promise<boolean> {
  await saveResultFile(jobId, "original", formattingResult.markedOriginal);
  await saveResultFile(jobId, "formatted", formattingResult.formattedDocument);

  if (!formattingResult.fullMarkedOriginal || !formattingResult.fullFormattedDocument) {
    return false;
  }

  await Promise.all([
    saveFullVersionFile(jobId, "original", formattingResult.fullMarkedOriginal),
    saveFullVersionFile(jobId, "formatted", formattingResult.fullFormattedDocument),
  ]);
  console.log(`[confirm-rules] Saved full versions for job ${jobId} (hook-offer)`);
  return true;
}

function mergeStatistics(
  input: PipelineOutput & { prior?: DocumentStatistics }
): DocumentStatistics {
  return {
    ...input.analysis.statistics,
    // Метаданные извлечения правил записал этап разбора — не затираем их анализом.
    rulesConfidence: input.prior?.rulesConfidence,
    rulesSource: input.prior?.rulesSource,
    rulesNormalized: input.prior?.rulesNormalized,
    rulesDroppedChars: input.prior?.rulesDroppedChars,
    rulesSchemaMode: input.prior?.rulesSchemaMode,
    pipelineTimeMs: input.pipelineTimeMs,
    markupTimeMs: input.markup.markupDurationMs,
    markupDegraded: input.markup.markupDegraded,
    markupDegradedChunks: input.markup.markupDegradedChunks,
    ...(input.formatting.wasTruncated && {
      wasTruncated: true,
      originalPageCount: input.formatting.originalPageCount,
      pageLimitApplied: input.formatting.pageLimitApplied,
    }),
  };
}
