/**
 * Сборщик зависших задач.
 *
 * Отдельный модуль от job-store: порогов стало три (инлайн, воркер, очередь),
 * и логика их выбора не помещается в файл хранилища, не выходя за лимит длины.
 * Зависимость односторонняя: job-stuck → job-store.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { refundUse } from "@/lib/payment/refund";
import { rowToJob, type JobState, type JobStatus } from "./job-store";

/** Промежуточные статусы — задача считается зависшей, если долго в одном из них */
export const STUCK_STATUSES: JobStatus[] = [
  "pending",
  "uploading",
  "extracting_text",
  "parsing_rules",
  "analyzing",
  "formatting",
];

export const STUCK_ERROR_MESSAGE = "Превышено время обработки";

/** Задача честно ждала очереди дольше разумного — это не её вина и не вина пользователя. */
export const QUEUE_OVERLOADED_MESSAGE = "Очередь перегружена, попробуйте позже";

/** Воркер шлёт heartbeat каждые 10 секунд; молчание 10 минут — процесс потерян. */
const WORKER_STUCK_AFTER_MS = 10 * 60 * 1000;

/** Потолок ожидания в очереди: столько задача может лежать в pending. */
const PENDING_STUCK_AFTER_MS = 20 * 60 * 1000;

/** Колонки, по которым выбирается порог зависания. */
const STUCK_COLUMNS =
  "id, status, user_id, worker_id, worker_heartbeat_at, shadow_of, created_at, updated_at";

/** Возвращает списанное использование за зависшую задачу (не по вине пользователя). */
async function refundStuckJob(
  userId: string | null | undefined,
  jobId: string,
  message: string
): Promise<void> {
  if (!userId) return; // анонимные задачи — с них использование не списывалось
  try {
    await refundUse(userId, jobId, message);
  } catch (refundError) {
    console.error("[job-stuck] refund failed for job:", jobId, refundError);
  }
}

interface StuckRow {
  id: string;
  status: JobStatus;
  user_id: string | null;
  worker_id: string | null;
  worker_heartbeat_at: string | null;
  shadow_of: string | null;
  created_at: string;
  updated_at: string;
}

interface StuckDecision {
  /** По какой колонке считается «давно не двигалась». */
  column: "updated_at" | "worker_heartbeat_at";
  cutoff: string;
  message: string;
}

/**
 * Порог зависания зависит от того, кто держит задачу:
 *   pending — ждёт очереди, порог 20 минут (в инлайн-режиме очереди нет, и
 *             задача всё равно уходит из pending за секунды);
 *   worker_id — считает воркер, живость видна по heartbeat, порог 10 минут;
 *   иначе — инлайн внутри функции Vercel, порог передаётся вызывающим (3 минуты).
 */
export function stuckCutoffFor(
  row: StuckRow,
  inlineStuckAfterMs: number,
  now: number = Date.now()
): StuckDecision {
  if (row.status === "pending") {
    return {
      column: "updated_at",
      cutoff: new Date(now - PENDING_STUCK_AFTER_MS).toISOString(),
      message: QUEUE_OVERLOADED_MESSAGE,
    };
  }

  if (row.worker_id) {
    return {
      // Воркер, взявший задачу, но ни разу не отметившийся, судится по updated_at:
      // claim_next_job ставит heartbeat сразу, так что NULL означает старую строку.
      column: row.worker_heartbeat_at ? "worker_heartbeat_at" : "updated_at",
      cutoff: new Date(now - WORKER_STUCK_AFTER_MS).toISOString(),
      message: STUCK_ERROR_MESSAGE,
    };
  }

  return {
    column: "updated_at",
    cutoff: new Date(now - inlineStuckAfterMs).toISOString(),
    message: STUCK_ERROR_MESSAGE,
  };
}

/**
 * Помечает задачу failed, если она всё ещё за порогом. Условия на статус и время
 * живут в самом UPDATE — повторный вызов для уже обработанной задачи ничего не
 * меняет. Возврат списания — только для настоящих задач: у теневых списания нет.
 */
async function failStuckRow(
  row: StuckRow,
  decision: StuckDecision
): Promise<JobState | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("jobs")
    .update({
      status: "failed",
      error: decision.message,
      status_message: decision.message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .in("status", STUCK_STATUSES)
    .lt(decision.column, decision.cutoff)
    .select()
    .single();

  if (error || !data) return null;

  const job = rowToJob(data as Record<string, unknown>);
  if (!row.shadow_of) {
    await refundStuckJob(job.userId, job.id, decision.message);
  }
  return job;
}

/**
 * Если задача jobId зависла в промежуточном статусе дольше своего порога —
 * помечает её failed и возвращает списанное использование.
 *
 * Вызывается из GET /api/status/[jobId] (self-heal на чтении) и как строительный
 * блок resetStuckJobs (пакетный предохранитель по cron). Порогов три (см.
 * stuckCutoffFor), поэтому строка сначала читается, а UPDATE остаётся условным.
 */
export async function failIfStuck(
  jobId: string,
  stuckAfterMs: number
): Promise<JobState | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("jobs")
    .select(STUCK_COLUMNS)
    .eq("id", jobId)
    .single();

  if (error || !data) return null;

  const row = data as unknown as StuckRow;
  if (!STUCK_STATUSES.includes(row.status)) return null;

  return failStuckRow(row, stuckCutoffFor(row, stuckAfterMs));
}

/**
 * Маркировать зависшие задачи как failed
 * (промежуточные статусы без обновления дольше своего порога)
 */
export async function resetStuckJobs(
  stuckAfterMs: number = 30 * 60 * 1000
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("jobs")
    .select(STUCK_COLUMNS)
    .in("status", STUCK_STATUSES)
    .limit(500);

  if (error) {
    console.error("[job-stuck] resetStuckJobs error:", error);
    return 0;
  }

  const rows = (data ?? []) as unknown as StuckRow[];
  let healed = 0;

  for (const row of rows) {
    const job = await failStuckRow(row, stuckCutoffFor(row, stuckAfterMs));
    if (job) healed++;
  }

  return healed;
}
