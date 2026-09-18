/**
 * Дочерний процесс воркера: обрабатывает ровно одну задачу и умирает.
 *
 * Отдельный процесс нужен потому, что v6 дёргает pandoc и soffice через
 * execSync — heartbeat из того же процесса во время рендера не ушёл бы.
 * Код выхода — контракт с супервизором (см. errors.ts).
 */

import os from "os";
import { getJob, updateJob, failJob } from "@/lib/storage/job-store";
import { refundUse } from "@/lib/payment/refund";
import { JobAlreadyTerminalError } from "@/lib/processing/gost-job";
import { EXIT_OK, EXIT_PERMANENT, EXIT_TRANSIENT, isTransientError } from "./errors";
import {
  permanentStageMessage,
  queueWaitMs,
  readWorkerColumns,
  runStage,
} from "./stages";

const WORKER_ID = process.env.WORKER_ID || os.hostname();
const GIT_SHA = process.env.WORKER_GIT_SHA || "unknown";

function log(event: string, fields: Record<string, unknown> = {}): void {
  const tail = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.log(`[worker:child] ${event}${tail ? ` ${tail}` : ""}`);
}

async function run(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Задача не найдена: ${jobId}`);

  const columns = await readWorkerColumns(jobId);
  const isShadow = Boolean(columns?.shadow_of);
  const claimedAt = columns?.worker_claimed_at ?? new Date().toISOString();
  const waitMs = queueWaitMs(columns, claimedAt);

  log("start", { jobId, shadow: isShadow, queueWaitMs: waitMs });

  const startedAt = Date.now();
  const statistics = await runStage({ jobId, job, isShadow, log });
  const processMs = Date.now() - startedAt;

  await updateJob(jobId, {
    statistics: {
      ...statistics,
      worker: {
        workerId: WORKER_ID,
        queueWaitMs: waitMs,
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
    // На этапах методички списаний не было — там refundUse no-op по построению.
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
    // Задачу успел забрать сборщик зависших: статус failed уже стоит, списание
    // уже возвращено. Трогать статус и возврат второй раз нельзя.
    if (error instanceof JobAlreadyTerminalError) {
      log("orphaned", { jobId, error: message });
      process.exit(EXIT_PERMANENT);
    }

    // Отказ разбора методички и исчерпанный бюджет AI — терминальны, но их
    // текст («не дождались ответа модели») попадает под шаблоны временных.
    const stageMessage = permanentStageMessage(error);
    const humanMessage = stageMessage ?? message;

    if (!stageMessage && isTransientError(error)) {
      log("transient", { jobId, error: message });
      process.exit(EXIT_TRANSIENT);
    }

    log("permanent", { jobId, error: message });
    try {
      await markPermanent(jobId, humanMessage);
    } catch (markError) {
      console.error("[worker:child] не удалось пометить задачу failed:", markError);
    }
    process.exit(EXIT_PERMANENT);
  }
}

void main();
