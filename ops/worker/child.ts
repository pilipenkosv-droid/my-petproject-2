/**
 * Дочерний процесс воркера: обрабатывает ровно одну задачу и умирает.
 *
 * Отдельный процесс нужен потому, что v6 дёргает pandoc и soffice через
 * execSync — heartbeat из того же процесса во время рендера не ушёл бы.
 * Код выхода — контракт с супервизором (см. errors.ts).
 */

import os from "os";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getJob, updateJob, updateJobProgress, failJob } from "@/lib/storage/job-store";
import { getFile } from "@/lib/storage/file-storage";
import { getUserAccess } from "@/lib/payment/access";
import { refundUse } from "@/lib/payment/refund";
import { processGostJob } from "@/lib/processing/gost-job";
import type { AccessType } from "@/lib/pipeline-v6/adapter-legacy";
import { EXIT_OK, EXIT_PERMANENT, EXIT_TRANSIENT, isTransientError } from "./errors";

const WORKER_ID = process.env.WORKER_ID || os.hostname();
const GIT_SHA = process.env.WORKER_GIT_SHA || "unknown";

interface WorkerColumns {
  created_at: string;
  worker_claimed_at: string | null;
  attempts: number;
  shadow_of: string | null;
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  const tail = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.log(`[worker:child] ${event}${tail ? ` ${tail}` : ""}`);
}

/** Колонки очереди живут вне JobState — читаем их напрямую. */
async function readWorkerColumns(jobId: string): Promise<WorkerColumns | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("jobs")
    .select("created_at, worker_claimed_at, attempts, shadow_of")
    .eq("id", jobId)
    .single();

  if (error || !data) return null;
  return data as WorkerColumns;
}

async function resolveAccessType(
  userId: string | undefined,
  isShadow: boolean
): Promise<AccessType> {
  if (isShadow || !userId) return "trial";
  const access = await getUserAccess(userId);
  return access.accessType as AccessType;
}

async function run(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Задача не найдена: ${jobId}`);
  if (!job.sourceDocumentId) throw new Error("У задачи нет исходного документа");

  const columns = await readWorkerColumns(jobId);
  const isShadow = Boolean(columns?.shadow_of);
  const claimedAt = columns?.worker_claimed_at ?? new Date().toISOString();
  const queueWaitMs = Math.max(
    0,
    new Date(claimedAt).getTime() - new Date(columns?.created_at ?? claimedAt).getTime()
  );

  const sourceBuffer = await getFile(job.sourceDocumentId);
  if (!sourceBuffer) throw new Error("Исходный документ недоступен в хранилище");

  const accessType = await resolveAccessType(job.userId, isShadow);
  log("start", { jobId, accessType, shadow: isShadow, queueWaitMs });

  const startedAt = Date.now();
  const { statistics } = await processGostJob(
    jobId,
    sourceBuffer,
    accessType,
    async (status, progress, message) => {
      await updateJobProgress(jobId, status, progress, message);
    }
  );
  const processMs = Date.now() - startedAt;

  await updateJob(jobId, {
    statistics: {
      ...statistics,
      worker: {
        workerId: WORKER_ID,
        queueWaitMs,
        processMs,
        attempts: columns?.attempts ?? 1,
        hostname: os.hostname(),
        gitSha: GIT_SHA,
      },
    },
  });

  log("done", { jobId, processMs });
}

/** Терминальная ошибка: статус и возврат списания — ответственность ребёнка. */
async function markPermanent(jobId: string, message: string): Promise<void> {
  const job = await getJob(jobId);
  const columns = await readWorkerColumns(jobId);
  await failJob(jobId, message);
  if (!columns?.shadow_of) {
    await refundUse(job?.userId, jobId, message);
  }
}

async function main(): Promise<void> {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("[worker:child] не передан jobId");
    process.exit(EXIT_PERMANENT);
  }

  try {
    await run(jobId);
    process.exit(EXIT_OK);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    if (isTransientError(error)) {
      log("transient", { jobId, error: message });
      process.exit(EXIT_TRANSIENT);
    }
    log("permanent", { jobId, error: message });
    try {
      await markPermanent(jobId, message);
    } catch (markError) {
      console.error("[worker:child] не удалось пометить задачу failed:", markError);
    }
    process.exit(EXIT_PERMANENT);
  }
}

void main();
