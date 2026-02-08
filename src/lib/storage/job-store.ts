/**
 * Хранение состояния задач обработки — Supabase PostgreSQL
 *
 * Заменяет hybrid memory+/tmp подход на полноценное хранение в БД.
 * Работает корректно на Vercel serverless (состояние не теряется).
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  DocumentStatistics,
  FormattingRules,
  FormattingViolation,
} from "@/types/formatting-rules";

export type JobStatus =
  | "pending"
  | "uploading"
  | "extracting_text"
  | "parsing_rules"
  | "awaiting_confirmation"
  | "analyzing"
  | "formatting"
  | "completed"
  | "failed";

export interface JobState {
  id: string;
  status: JobStatus;
  progress: number; // 0-100
  statusMessage: string;

  // Владелец (null для анонимных)
  userId?: string;

  // Входные файлы
  sourceDocumentId?: string;
  requirementsDocumentId?: string;

  // Оригинальные имена файлов
  sourceOriginalName?: string;
  requirementsOriginalName?: string;

  // Результаты
  rules?: FormattingRules;
  violations?: FormattingViolation[];
  statistics?: DocumentStatistics;

  // Выходные файлы
  markedOriginalId?: string;
  formattedDocumentId?: string;

  // Флаг наличия полной версии (для trial, разблокируется после оплаты)
  hasFullVersion?: boolean;

  // Тип работы и режим требований
  workType?: string;
  requirementsMode?: string;

  // Текст методички (для чата с методичкой)
  guidelinesText?: string;

  // Ошибка (если status === "failed")
  error?: string;

  // Временные метки
  createdAt: Date;
  updatedAt: Date;
}

/** DB row → JobState */
function rowToJob(row: Record<string, unknown>): JobState {
  return {
    id: row.id as string,
    status: row.status as JobStatus,
    progress: row.progress as number,
    statusMessage: row.status_message as string,
    userId: row.user_id as string | undefined,
    sourceDocumentId: row.source_document_id as string | undefined,
    requirementsDocumentId: row.requirements_document_id as string | undefined,
    sourceOriginalName: row.source_original_name as string | undefined,
    requirementsOriginalName: row.requirements_original_name as
      | string
      | undefined,
    markedOriginalId: row.marked_original_id as string | undefined,
    formattedDocumentId: row.formatted_document_id as string | undefined,
    hasFullVersion: row.has_full_version as boolean | undefined,
    rules: row.rules as FormattingRules | undefined,
    violations: row.violations as FormattingViolation[] | undefined,
    statistics: row.statistics as DocumentStatistics | undefined,
    workType: row.work_type as string | undefined,
    requirementsMode: row.requirements_mode as string | undefined,
    guidelinesText: row.guidelines_text as string | undefined,
    error: row.error as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/** JobState partial → DB columns (snake_case) */
function jobToRow(
  updates: Partial<JobState>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if (updates.status !== undefined) row.status = updates.status;
  if (updates.progress !== undefined) row.progress = updates.progress;
  if (updates.statusMessage !== undefined)
    row.status_message = updates.statusMessage;
  if (updates.sourceDocumentId !== undefined)
    row.source_document_id = updates.sourceDocumentId;
  if (updates.requirementsDocumentId !== undefined)
    row.requirements_document_id = updates.requirementsDocumentId;
  if (updates.sourceOriginalName !== undefined)
    row.source_original_name = updates.sourceOriginalName;
  if (updates.requirementsOriginalName !== undefined)
    row.requirements_original_name = updates.requirementsOriginalName;
  if (updates.markedOriginalId !== undefined)
    row.marked_original_id = updates.markedOriginalId;
  if (updates.formattedDocumentId !== undefined)
    row.formatted_document_id = updates.formattedDocumentId;
  if (updates.hasFullVersion !== undefined)
    row.has_full_version = updates.hasFullVersion;
  if (updates.rules !== undefined) row.rules = updates.rules;
  if (updates.violations !== undefined) row.violations = updates.violations;
  if (updates.statistics !== undefined) row.statistics = updates.statistics;
  if (updates.error !== undefined) row.error = updates.error;
  if (updates.userId !== undefined) row.user_id = updates.userId;
  if (updates.workType !== undefined) row.work_type = updates.workType;
  if (updates.requirementsMode !== undefined) row.requirements_mode = updates.requirementsMode;
  if (updates.guidelinesText !== undefined) row.guidelines_text = updates.guidelinesText;

  return row;
}

/**
 * Создать новую задачу
 */
export async function createJob(id: string, userId?: string): Promise<JobState> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      id,
      status: "pending",
      progress: 0,
      status_message: "Задача создана",
      user_id: userId || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[job-store] Failed to create job:", error);
    throw new Error(`Failed to create job: ${error.message}`);
  }

  return rowToJob(data as Record<string, unknown>);
}

/**
 * Получить задачу по ID
 */
export async function getJob(id: string): Promise<JobState | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    console.error("[job-store] Failed to get job:", error);
    return null;
  }

  return rowToJob(data as Record<string, unknown>);
}

/**
 * Обновить состояние задачи
 */
export async function updateJob(
  id: string,
  updates: Partial<JobState>
): Promise<JobState | null> {
  const supabase = getSupabaseAdmin();
  const row = jobToRow(updates);

  if (Object.keys(row).length === 0) {
    return getJob(id);
  }

  const { data, error } = await supabase
    .from("jobs")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[job-store] Failed to update job:", error);
    return null;
  }

  return rowToJob(data as Record<string, unknown>);
}

/**
 * Обновить прогресс задачи
 */
export async function updateJobProgress(
  id: string,
  status: JobStatus,
  progress: number,
  message: string
): Promise<JobState | null> {
  return updateJob(id, {
    status,
    progress,
    statusMessage: message,
  });
}

/**
 * Пометить задачу как завершённую
 */
export async function completeJob(
  id: string,
  result: {
    markedOriginalId: string;
    formattedDocumentId: string;
    violations: FormattingViolation[];
    statistics: DocumentStatistics;
    rules: FormattingRules;
    hasFullVersion?: boolean;
  }
): Promise<JobState | null> {
  return updateJob(id, {
    status: "completed",
    progress: 100,
    statusMessage: "Обработка завершена",
    ...result,
  });
}

/**
 * Пометить задачу как неуспешную
 */
export async function failJob(
  id: string,
  error: string
): Promise<JobState | null> {
  return updateJob(id, {
    status: "failed",
    statusMessage: error,
    error,
  });
}

/**
 * Удалить задачу
 */
export async function deleteJob(id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) {
    console.error("[job-store] Failed to delete job:", error);
    return false;
  }

  return true;
}

/**
 * Очистить старые задачи
 */
export async function cleanupOldJobs(
  maxAgeMs: number = 3600000
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const { data, error } = await supabase
    .from("jobs")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[job-store] Failed to cleanup old jobs:", error);
    return 0;
  }

  return data?.length ?? 0;
}

/**
 * Получить статус-сообщения для UI
 */
export const STATUS_MESSAGES: Record<JobStatus, string> = {
  pending: "Ожидание начала обработки",
  uploading: "Загрузка файлов",
  extracting_text: "Извлечение текста из документов",
  parsing_rules: "Анализ требований форматирования",
  awaiting_confirmation: "Ожидание подтверждения требований",
  analyzing: "Проверка документа на соответствие требованиям",
  formatting: "Применение форматирования",
  completed: "Обработка завершена",
  failed: "Ошибка обработки",
};

/**
 * Получить все задачи пользователя (для профиля)
 */
export async function getJobsByUser(userId: string): Promise<JobState[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[job-store] Failed to get jobs by user:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => rowToJob(row));
}

/**
 * Получить прогресс для каждого статуса
 */
export const STATUS_PROGRESS: Record<JobStatus, number> = {
  pending: 0,
  uploading: 10,
  extracting_text: 25,
  parsing_rules: 40,
  awaiting_confirmation: 50,
  analyzing: 60,
  formatting: 80,
  completed: 100,
  failed: 0,
};
