/**
 * Диспетчер этапов воркера: задача «своя методичка» проходит через очередь
 * дважды — сначала разбор методички, потом форматирование документа.
 *
 * Живёт отдельно от child.ts, чтобы процессная обвязка (коды выхода, failJob)
 * не мешалась с логикой этапов.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getJob, updateJobProgress, type JobState } from "@/lib/storage/job-store";
import { getFile } from "@/lib/storage/file-storage";
import { getMimeTypeByExtension } from "@/lib/pipeline/text-extractor";
import { getUserAccess } from "@/lib/payment/access";
import { AIBudgetExceededError } from "@/lib/ai/gateway";
import { RulesExtractionError, rulesExtractionMessage } from "@/lib/ai/provider";
import { processGostJob } from "@/lib/processing/gost-job";
import { processExtractRulesJob } from "@/lib/processing/extract-rules-job";
import { processConfirmRulesJob } from "@/lib/processing/confirm-rules-job";
import type { JobStage } from "@/lib/processing/stage";
import type { DocumentStatistics } from "@/types/formatting-rules";
import type { AccessType } from "@/lib/pipeline-v6/adapter-legacy";

/** Разбор методички: один AI-вызов на документ до 60+ тыс. символов. */
export const EXTRACT_DEADLINE_MS = 8 * 60 * 1000;
/** Форматирование: AI-разметка блоков плюс сборка документа. */
export const FORMAT_DEADLINE_MS = 10 * 60 * 1000;

export interface WorkerColumns {
  created_at: string;
  worker_claimed_at: string | null;
  attempts: number;
  shadow_of: string | null;
}

export interface StageContext {
  jobId: string;
  job: JobState;
  stage: JobStage;
  isShadow: boolean;
  log: (event: string, fields?: Record<string, unknown>) => void;
}

/** Колонки очереди живут вне JobState — читаем их напрямую. */
export async function readWorkerColumns(jobId: string): Promise<WorkerColumns | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("jobs")
    .select("created_at, worker_claimed_at, attempts, shadow_of")
    .eq("id", jobId)
    .single();

  if (error || !data) return null;
  return data as WorkerColumns;
}

/**
 * Терминальные ошибки этапов методички: повтор даст то же самое.
 * Списаний на этих этапах не было — возвращать нечего.
 * undefined — ошибка не из этого класса, решает общая классификация.
 *
 * Бюджет AI исчерпан — терминально только на разборе методички: там это
 * единственный вызов модели и её отказ виден пользователю дословно. На
 * остальных этапах AIBudgetExceededError прилетает из любого вызова внутри
 * пайплайна, и отнимать у задачи повтор нельзя (поведение фазы 1).
 */
export function permanentStageMessage(error: unknown, stage: JobStage): string | undefined {
  if (error instanceof RulesExtractionError) return rulesExtractionMessage(error);
  if (error instanceof AIBudgetExceededError && stage === "extract-rules") {
    return "Не удалось разобрать методичку за отведённое время, попробуйте ещё раз или выберите ГОСТ";
  }
  return undefined;
}

/**
 * Снимает признаки захвата после промежуточного этапа: задача остаётся в
 * awaiting_confirmation и ждёт пользователя. Со старым worker_id и застывшим
 * heartbeat сборщик зависших пометил бы её failed — в том числе посреди
 * инлайн-обработки, если подтверждение уйдёт мимо воркера.
 */
export async function releaseWorkerClaim(jobId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("jobs")
    .update({ worker_id: null, worker_claimed_at: null, worker_heartbeat_at: null })
    .eq("id", jobId);

  if (error) console.error("[worker:stages] releaseWorkerClaim failed:", error);
}

async function resolveAccessType(
  userId: string | undefined,
  isShadow: boolean
): Promise<AccessType> {
  if (isShadow || !userId) return "trial";
  const access = await getUserAccess(userId);
  return access.accessType as AccessType;
}

function reporter(jobId: string) {
  return async (status: Parameters<typeof updateJobProgress>[1], progress: number, message: string) => {
    await updateJobProgress(jobId, status, progress, message);
  };
}

async function runGost(ctx: StageContext): Promise<DocumentStatistics> {
  const { jobId, job } = ctx;
  if (!job.sourceDocumentId) throw new Error("У задачи нет исходного документа");

  const sourceBuffer = await getFile(job.sourceDocumentId);
  if (!sourceBuffer) throw new Error("Исходный документ недоступен в хранилище");

  const accessType = await resolveAccessType(job.userId, ctx.isShadow);
  ctx.log("stage", { jobId, stage: "gost", accessType });

  const { statistics } = await processGostJob(jobId, sourceBuffer, accessType, reporter(jobId));
  return statistics;
}

async function runExtractRules(ctx: StageContext): Promise<DocumentStatistics> {
  const { jobId, job } = ctx;
  if (!job.requirementsDocumentId) throw new Error("У задачи нет файла методички");

  const requirementsBuffer = await getFile(job.requirementsDocumentId);
  if (!requirementsBuffer) throw new Error("Методичка недоступна в хранилище");

  // MIME, который роут проверил при загрузке; у файла без расширения он
  // единственный источник правды.
  const mimeType =
    job.statistics?.requirementsMimeType ??
    getMimeTypeByExtension(job.requirementsOriginalName ?? "") ??
    "";
  ctx.log("stage", { jobId, stage: "extract-rules", mimeType });

  await processExtractRulesJob(jobId, requirementsBuffer, mimeType, {
    deadline: Date.now() + EXTRACT_DEADLINE_MS,
    onProgress: reporter(jobId),
  });

  // Задача ждёт пользователя, а не воркер: признаки захвата больше не нужны.
  await releaseWorkerClaim(jobId);

  // Статистику этапа записал сам processExtractRulesJob — перечитываем её,
  // чтобы дописать блок worker и не потерять поля rules*.
  const saved = await getJob(jobId);
  return saved?.statistics ?? ({} as DocumentStatistics);
}

async function runConfirmRules(ctx: StageContext): Promise<DocumentStatistics> {
  const { jobId, job } = ctx;
  if (!job.sourceDocumentId) throw new Error("У задачи нет исходного документа");
  if (!job.rules) throw new Error("У задачи нет подтверждённых правил");

  const sourceBuffer = await getFile(job.sourceDocumentId);
  if (!sourceBuffer) throw new Error("Исходный документ недоступен в хранилище");

  const accessType = await resolveAccessType(job.userId, ctx.isShadow);
  ctx.log("stage", { jobId, stage: "confirm-rules", accessType });

  const { statistics } = await processConfirmRulesJob(
    jobId,
    sourceBuffer,
    job.rules,
    accessType,
    {
      deadline: Date.now() + FORMAT_DEADLINE_MS,
      onProgress: reporter(jobId),
      priorStatistics: job.statistics,
    }
  );
  return statistics;
}

/** Выполняет этап задачи и возвращает статистику, в которую воркер допишет свой блок. */
export async function runStage(ctx: StageContext): Promise<DocumentStatistics> {
  switch (ctx.stage) {
    case "extract-rules":
      return runExtractRules(ctx);
    case "confirm-rules":
      return runConfirmRules(ctx);
    default:
      return runGost(ctx);
  }
}

/** Сколько задача пролежала в очереди до захвата. */
export function queueWaitMs(columns: WorkerColumns | null, claimedAt: string): number {
  return Math.max(
    0,
    new Date(claimedAt).getTime() - new Date(columns?.created_at ?? claimedAt).getTime()
  );
}
