/**
 * Обработка документа по стандартному ГОСТу — общая логика роута и воркера.
 *
 * Модуль не импортирует next/*: его исполняет и /api/process-gost (инлайн),
 * и внешний воркер на обычном Node (ADR-016).
 */

import { saveResultFile, saveFullVersionFile } from "@/lib/storage/file-storage";
import { updateJobProgress, completeJob, type JobStatus } from "@/lib/storage/job-store";
import { DEFAULT_GOST_RULES, type DocumentStatistics } from "@/types/formatting-rules";
import { runPipelineV6 } from "@/lib/pipeline-v6/orchestrator";
import { adaptPipelineV6ToLegacy, type AccessType, type LegacyAdapterResult } from "@/lib/pipeline-v6/adapter-legacy";
import { shouldUsePipelineV7 } from "@/lib/pipeline-v7/feature-flag";
import { tryPipelineV7 } from "@/lib/pipeline-v7/try-v7";

export type ProgressReporter = (
  status: JobStatus,
  progress: number,
  message: string
) => Promise<void>;

export interface GostJobResult {
  statistics: DocumentStatistics & { fixesApplied: number; violationsDetected: number };
  violationsCount: number;
}

/** Запускает v7, при отказе — v6; возвращает адаптированный результат. */
async function runPipelines(
  jobId: string,
  sourceBuffer: Buffer,
  accessType: AccessType
): Promise<LegacyAdapterResult> {
  let adapted: LegacyAdapterResult | undefined;
  let v7Fallback: string | undefined;

  if (shouldUsePipelineV7(jobId)) {
    const attempt = await tryPipelineV7(sourceBuffer, jobId, accessType);
    if ("adapted" in attempt) {
      adapted = attempt.adapted;
    } else {
      v7Fallback = attempt.fallback;
      console.warn("[v7] fallback", v7Fallback);
    }
  }

  if (!adapted) {
    const pipelineResult = await runPipelineV6(sourceBuffer, {
      documentId: jobId,
      templateSlug: "gost-7.32",
      rewrite: false,
      fixIterations: 1,
    });
    adapted = await adaptPipelineV6ToLegacy(sourceBuffer, pipelineResult, accessType);
    adapted.statistics.pipelineVersion = "v6";
    if (v7Fallback) adapted.statistics.v7Fallback = v7Fallback;
  }

  return adapted;
}

export async function processGostJob(
  jobId: string,
  sourceBuffer: Buffer,
  accessType: AccessType,
  onProgress?: ProgressReporter
): Promise<GostJobResult> {
  const report: ProgressReporter =
    onProgress ??
    (async (status, progress, message) => {
      await updateJobProgress(jobId, status, progress, message);
    });

  await report("analyzing", 20, "AI-разметка блоков документа");

  // v6 не эмитит stage-события — шлём опорные тики, чтобы фронт последовательно
  // зажигал analyzing → formatting так же, как у старого pipeline.
  const tick50 = setTimeout(() => {
    report("analyzing", 50, "Проверка документа на соответствие ГОСТ").catch(() => {});
  }, 1500);
  const tick70 = setTimeout(() => {
    report("formatting", 70, "Применение форматирования по ГОСТ").catch(() => {});
  }, 4000);

  let adapted: LegacyAdapterResult | undefined;
  try {
    adapted = await runPipelines(jobId, sourceBuffer, accessType);
  } finally {
    clearTimeout(tick50);
    clearTimeout(tick70);
  }
  if (!adapted) throw new Error("Не удалось обработать документ");

  await report("formatting", 90, "Сохранение результатов");

  await saveResultFile(jobId, "original", adapted.markedOriginal);
  await saveResultFile(jobId, "formatted", adapted.formattedDocument);

  let hasFullVersion = false;
  if (adapted.fullMarkedOriginal && adapted.fullFormattedDocument) {
    await Promise.all([
      saveFullVersionFile(jobId, "original", adapted.fullMarkedOriginal),
      saveFullVersionFile(jobId, "formatted", adapted.fullFormattedDocument),
    ]);
    hasFullVersion = true;
  }

  const statistics = {
    ...adapted.statistics,
    fixesApplied: adapted.fixesApplied,
    violationsDetected: adapted.violations.length,
  };

  await completeJob(jobId, {
    markedOriginalId: `${jobId}_original`,
    formattedDocumentId: `${jobId}_formatted`,
    violations: adapted.violations,
    statistics,
    rules: DEFAULT_GOST_RULES,
    ...(hasFullVersion && { hasFullVersion: true }),
  });

  return { statistics, violationsCount: adapted.violations.length };
}
