/**
 * Модуль очистки старых задач
 * Supabase Storage не требует ручной очистки файлов.
 * Очищаем только записи в БД (jobs).
 */

import { cleanupOldJobs, resetStuckJobs } from "./job-store";

// Время жизни задач (30 дней — для аналитики воронки конверсии)
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Выполнить очистку старых записей и сброс зависших задач
 */
export async function runCleanup(ttlMs: number = DEFAULT_TTL_MS): Promise<{
  jobsDeleted: number;
  stuckJobsReset: number;
}> {
  try {
    const jobsDeleted = await cleanupOldJobs(ttlMs);
    const stuckJobsReset = await resetStuckJobs();

    if (jobsDeleted > 0) {
      console.log(`[Cleanup] Deleted ${jobsDeleted} old jobs`);
    }
    if (stuckJobsReset > 0) {
      console.log(`[Cleanup] Reset ${stuckJobsReset} stuck jobs`);
    }

    return { jobsDeleted, stuckJobsReset };
  } catch (error) {
    console.error("[Cleanup] Error during cleanup:", error);
    return { jobsDeleted: 0, stuckJobsReset: 0 };
  }
}
