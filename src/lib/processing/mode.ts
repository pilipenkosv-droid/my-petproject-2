/**
 * Режим обработки документа: считает ли роут сам или ставит задачу в очередь
 * внешнего воркера (ADR-016, шаг 4).
 *
 *   PROCESSING_MODE=inline — всё как раньше, роут считает сам (умолчание).
 *   PROCESSING_MODE=shadow — роут считает сам, но дополнительно ставит воркеру
 *                            теневую копию задачи для сравнения.
 *   PROCESSING_MODE=worker — задача уходит в очередь, ответ 202.
 *
 *   WORKER_PERCENT — доля задач в режиме worker, 0..100 (умолчание 100).
 *                    Бакет считается от jobId, как у PIPELINE_V7_PERCENT.
 *
 * Модуль не импортирует next/*: его тянет роут, но он же должен собираться
 * в бандл воркера.
 */

import { fnv1a } from "@/lib/pipeline-v7/feature-flag";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ProcessingMode = "inline" | "shadow" | "worker";

/** Воркер считается живым, если пинговал таблицу workers не позже этого срока. */
const WORKER_ALIVE_MS = 2 * 60 * 1000;

const DEFAULT_WORKER_PERCENT = 100;

export function getProcessingMode(): ProcessingMode {
  const raw = (process.env.PROCESSING_MODE ?? "").trim().toLowerCase();
  if (raw === "worker" || raw === "shadow") return raw;
  return "inline";
}

/** Доля задач в режиме воркера. Мусор в переменной → 0, то есть режим выключен. */
export function workerPercent(): number {
  const raw = (process.env.WORKER_PERCENT ?? "").trim();
  if (raw === "") return DEFAULT_WORKER_PERCENT;
  if (!/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  if (n < 0 || n > 100) return 0;
  return n;
}

/** Попала ли задача в раскатываемую долю. Один и тот же jobId всегда решается одинаково. */
export function isWorkerBucket(jobId: string): boolean {
  const p = workerPercent();
  if (p <= 0) return false;
  if (p >= 100) return true;
  return fnv1a(jobId) % 100 < p;
}

/**
 * Жив ли хоть один воркер. Простаивающий воркер не имеет задачи, куда писать
 * heartbeat, поэтому признак жизни — отдельная таблица workers.
 * Любая ошибка запроса трактуется как «мёртв»: лучше посчитать инлайном.
 */
export async function isWorkerAlive(): Promise<boolean> {
  const cutoff = new Date(Date.now() - WORKER_ALIVE_MS).toISOString();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("workers")
      .select("id")
      .gt("last_seen_at", cutoff)
      .limit(1);

    if (error) {
      console.error("[processing-mode] workers query failed:", error);
      return false;
    }
    return (data ?? []).length > 0;
  } catch (queryError) {
    console.error("[processing-mode] workers query threw:", queryError);
    return false;
  }
}

/** Уходит ли эта задача в очередь вместо инлайн-обработки. */
export async function shouldQueueForWorker(jobId: string): Promise<boolean> {
  if (getProcessingMode() !== "worker") return false;
  if (!isWorkerBucket(jobId)) return false;
  return isWorkerAlive();
}
