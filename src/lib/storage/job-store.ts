/**
 * Хранение состояния задач обработки
 * Hybrid: in-memory cache + JSON-файлы на диске для устойчивости на Vercel
 * (serverless-функции не разделяют память, но /tmp доступен всем)
 */

import { promises as fs } from "fs";
import path from "path";
import { DocumentStatistics, FormattingRules, FormattingViolation } from "@/types/formatting-rules";

const isProduction = process.env.NODE_ENV === "production";
const JOBS_DIR = isProduction ? "/tmp/smartformat/jobs" : "./uploads/jobs";

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

// In-memory кэш (ускоряет чтение в рамках одного инстанса)
const globalForJobs = globalThis as unknown as {
  jobsStore: Map<string, JobState> | undefined;
};
const memoryCache = globalForJobs.jobsStore ?? new Map<string, JobState>();
if (process.env.NODE_ENV !== "production") {
  globalForJobs.jobsStore = memoryCache;
}

/** Путь к JSON-файлу job на диске */
function jobFilePath(id: string): string {
  return path.join(JOBS_DIR, `${id}.json`);
}

/** Записать job на диск (async, fire-and-forget safe) */
async function persistJob(job: JobState): Promise<void> {
  try {
    await fs.mkdir(JOBS_DIR, { recursive: true });
    await fs.writeFile(jobFilePath(job.id), JSON.stringify(job), "utf-8");
  } catch (err) {
    console.error(`[job-store] Failed to persist job ${job.id}:`, err);
  }
}

/** Прочитать job с диска */
async function loadJobFromDisk(id: string): Promise<JobState | null> {
  try {
    const raw = await fs.readFile(jobFilePath(id), "utf-8");
    const data = JSON.parse(raw);
    // Восстанавливаем Date из строк
    data.createdAt = new Date(data.createdAt);
    data.updatedAt = new Date(data.updatedAt);
    return data as JobState;
  } catch {
    return null;
  }
}

/**
 * Создать новую задачу
 */
export async function createJob(id: string): Promise<JobState> {
  const job: JobState = {
    id,
    status: "pending",
    progress: 0,
    statusMessage: "Задача создана",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  memoryCache.set(id, job);
  await persistJob(job);
  return job;
}

/**
 * Получить задачу по ID — ищет в памяти, потом на диске
 */
export async function getJob(id: string): Promise<JobState | null> {
  const cached = memoryCache.get(id);
  if (cached) return cached;

  const fromDisk = await loadJobFromDisk(id);
  if (fromDisk) {
    memoryCache.set(id, fromDisk);
  }
  return fromDisk;
}

/**
 * Обновить состояние задачи
 */
export async function updateJob(id: string, updates: Partial<JobState>): Promise<JobState | null> {
  let job = memoryCache.get(id);
  if (!job) {
    job = await loadJobFromDisk(id) ?? undefined;
    if (!job) return null;
  }

  const updatedJob = {
    ...job,
    ...updates,
    updatedAt: new Date(),
  };

  memoryCache.set(id, updatedJob);
  await persistJob(updatedJob);
  return updatedJob;
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
export async function failJob(id: string, error: string): Promise<JobState | null> {
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
  memoryCache.delete(id);
  // Async удаление файла
  fs.unlink(jobFilePath(id)).catch(() => {});
  return true;
}

/**
 * Очистить старые задачи
 */
export async function cleanupOldJobs(maxAgeMs: number = 3600000): Promise<number> {
  let deletedCount = 0;
  const now = Date.now();

  // Чистим memory cache
  for (const [id, job] of memoryCache.entries()) {
    const jobAge = now - job.createdAt.getTime();
    if (jobAge > maxAgeMs) {
      memoryCache.delete(id);
      deletedCount++;
    }
  }

  // Чистим файлы на диске
  try {
    const files = await fs.readdir(JOBS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(JOBS_DIR, file);
      const stats = await fs.stat(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }
  } catch {
    // Директория может не существовать
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
