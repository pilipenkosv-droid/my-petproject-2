/**
 * Хранение состояния задач обработки
 * Для MVP используем in-memory хранилище
 * В production можно заменить на Redis или базу данных
 */

import { DocumentStatistics, FormattingRules, FormattingViolation } from "@/types/formatting-rules";

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
  
  // Входные файлы
  sourceDocumentId?: string;
  requirementsDocumentId?: string;
  
  // Результаты
  rules?: FormattingRules;
  violations?: FormattingViolation[];
  statistics?: DocumentStatistics;
  
  // Выходные файлы
  markedOriginalId?: string;
  formattedDocumentId?: string;
  
  // Ошибка (если status === "failed")
  error?: string;
  
  // Временные метки
  createdAt: Date;
  updatedAt: Date;
}

// Глобальное хранилище для устойчивости к hot reload в dev режиме
// В production это работает как обычный Map
const globalForJobs = globalThis as unknown as {
  jobsStore: Map<string, JobState> | undefined;
};

// In-memory хранилище задач (сохраняется между hot reload)
const jobs = globalForJobs.jobsStore ?? new Map<string, JobState>();

if (process.env.NODE_ENV !== "production") {
  globalForJobs.jobsStore = jobs;
}

/**
 * Создать новую задачу
 */
export function createJob(id: string): JobState {
  const job: JobState = {
    id,
    status: "pending",
    progress: 0,
    statusMessage: "Задача создана",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  jobs.set(id, job);
  return job;
}

/**
 * Получить задачу по ID
 */
export function getJob(id: string): JobState | null {
  return jobs.get(id) || null;
}

/**
 * Обновить состояние задачи
 */
export function updateJob(id: string, updates: Partial<JobState>): JobState | null {
  const job = jobs.get(id);
  if (!job) {
    return null;
  }
  
  const updatedJob = {
    ...job,
    ...updates,
    updatedAt: new Date(),
  };
  
  jobs.set(id, updatedJob);
  return updatedJob;
}

/**
 * Обновить прогресс задачи
 */
export function updateJobProgress(
  id: string,
  status: JobStatus,
  progress: number,
  message: string
): JobState | null {
  return updateJob(id, {
    status,
    progress,
    statusMessage: message,
  });
}

/**
 * Пометить задачу как завершённую
 */
export function completeJob(
  id: string,
  result: {
    markedOriginalId: string;
    formattedDocumentId: string;
    violations: FormattingViolation[];
    statistics: DocumentStatistics;
    rules: FormattingRules;
  }
): JobState | null {
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
export function failJob(id: string, error: string): JobState | null {
  return updateJob(id, {
    status: "failed",
    statusMessage: error,
    error,
  });
}

/**
 * Удалить задачу
 */
export function deleteJob(id: string): boolean {
  return jobs.delete(id);
}

/**
 * Очистить старые задачи
 */
export function cleanupOldJobs(maxAgeMs: number = 3600000): number {
  let deletedCount = 0;
  const now = Date.now();
  
  for (const [id, job] of jobs.entries()) {
    const jobAge = now - job.createdAt.getTime();
    if (jobAge > maxAgeMs) {
      jobs.delete(id);
      deletedCount++;
    }
  }
  
  return deletedCount;
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
