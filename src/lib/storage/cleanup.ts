/**
 * Модуль очистки старых файлов и задач
 */

import { cleanupOldFiles } from "./file-storage";
import { cleanupOldJobs } from "./job-store";

// Время жизни файлов и задач (1 час)
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Запуск периодической очистки
 */
let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupScheduler(intervalMs: number = 15 * 60 * 1000): void {
  if (cleanupInterval) {
    return; // Уже запущен
  }

  cleanupInterval = setInterval(async () => {
    await runCleanup();
  }, intervalMs);

  // Запускаем сразу при старте
  runCleanup();

  console.log(`[Cleanup] Scheduler started, interval: ${intervalMs / 1000}s`);
}

export function stopCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("[Cleanup] Scheduler stopped");
  }
}

/**
 * Выполнить очистку
 */
export async function runCleanup(ttlMs: number = DEFAULT_TTL_MS): Promise<{
  filesDeleted: number;
  jobsDeleted: number;
}> {
  try {
    const [filesDeleted, jobsDeleted] = await Promise.all([
      cleanupOldFiles(ttlMs),
      cleanupOldJobs(ttlMs),
    ]);

    if (filesDeleted > 0 || jobsDeleted > 0) {
      console.log(
        `[Cleanup] Deleted ${filesDeleted} files and ${jobsDeleted} jobs`
      );
    }

    return { filesDeleted, jobsDeleted };
  } catch (error) {
    console.error("[Cleanup] Error during cleanup:", error);
    return { filesDeleted: 0, jobsDeleted: 0 };
  }
}
