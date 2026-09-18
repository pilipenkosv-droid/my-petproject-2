/**
 * Ежедневная очистка старых данных:
 *   1. Записи в jobs (>30 дней) — нужны для воронки конверсии, дольше копить нет смысла.
 *   2. Зависшие джобы (resetStuckJobs).
 *   3. Файлы в Supabase Storage / bucket "documents" (>48ч) — иначе Free
 *      tier (1GB) кончается за пару месяцев, как 2026-05-06 и случилось.
 */

import { cleanupOldJobs } from "./job-store";
import { resetStuckJobs } from "./job-stuck";
import { cleanupOldFiles } from "./file-storage";
import { cleanupRetentionTables } from "./retention";

const JOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FILE_TTL_MS = 48 * 60 * 60 * 1000;
// Купленная полная версия (results/<jobId>/{original,formatted}_full.docx)
// не должна попадать под 48ч зачистку — иначе платному пользователю после
// платежа молча отдаётся урезанный trial-файл (/api/download/[fileId]
// подставляет full-версию только если она ещё существует). Живёт вместе
// с job (30 дней), а не с обычными результатами (48ч).
const FULL_VERSION_PATTERN = /_full\.docx$/;
const FULL_VERSION_TTL_MS = JOB_TTL_MS;

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
    filesDeleted = await cleanupOldFiles(FILE_TTL_MS, { excludePattern: FULL_VERSION_PATTERN });
    if (filesDeleted > 0) console.log(`[Cleanup] Deleted ${filesDeleted} old files`);
  } catch (error) {
    console.error("[Cleanup] files error:", error);
  }

  try {
    const fullVersionsDeleted = await cleanupOldFiles(FULL_VERSION_TTL_MS, { includePattern: FULL_VERSION_PATTERN });
    if (fullVersionsDeleted > 0) console.log(`[Cleanup] Deleted ${fullVersionsDeleted} old full-version files`);
    filesDeleted += fullVersionsDeleted;
  } catch (error) {
    console.error("[Cleanup] full-version files error:", error);
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
