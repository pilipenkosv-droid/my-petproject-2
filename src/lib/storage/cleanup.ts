/**
 * Ежедневная очистка старых данных:
 *   1. Записи в jobs (>30 дней) — нужны для воронки конверсии, дольше копить нет смысла.
 *   2. Зависшие джобы (resetStuckJobs).
 *   3. Файлы в Supabase Storage / bucket "documents" (>48ч) — иначе Free
 *      tier (1GB) кончается за пару месяцев, как 2026-05-06 и случилось.
 */

import { cleanupOldJobs, resetStuckJobs } from "./job-store";
import { cleanupOldFiles } from "./file-storage";
import { cleanupRetentionTables } from "./retention";

const JOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FILE_TTL_MS = 48 * 60 * 60 * 1000;

export async function runCleanup(ttlMs: number = JOB_TTL_MS): Promise<{
  jobsDeleted: number;
  stuckJobsReset: number;
  filesDeleted: number;
  retention: Record<string, number>;
}> {
  let jobsDeleted = 0;
  let stuckJobsReset = 0;
  let filesDeleted = 0;
  let retention: Record<string, number> = {};

  try {
    jobsDeleted = await cleanupOldJobs(ttlMs);
    if (jobsDeleted > 0) console.log(`[Cleanup] Deleted ${jobsDeleted} old jobs`);
  } catch (error) {
    console.error("[Cleanup] jobs error:", error);
  }

  try {
    stuckJobsReset = await resetStuckJobs();
    if (stuckJobsReset > 0) console.log(`[Cleanup] Reset ${stuckJobsReset} stuck jobs`);
  } catch (error) {
    console.error("[Cleanup] stuck jobs error:", error);
  }

  try {
    filesDeleted = await cleanupOldFiles(FILE_TTL_MS);
    if (filesDeleted > 0) console.log(`[Cleanup] Deleted ${filesDeleted} old files`);
  } catch (error) {
    console.error("[Cleanup] files error:", error);
  }

  try {
    retention = await cleanupRetentionTables();
    const total = Object.values(retention).reduce((s, n) => s + n, 0);
    if (total > 0) console.log(`[Cleanup] Retention deleted ${total} rows`, retention);
  } catch (error) {
    console.error("[Cleanup] retention error:", error);
  }

  return { jobsDeleted, stuckJobsReset, filesDeleted, retention };
}
