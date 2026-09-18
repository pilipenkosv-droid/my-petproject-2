/**
 * Супервизор воркера (ADR-016): забирает задачи из очереди и отдаёт их
 * дочернему процессу, шлёт heartbeat и убивает зависших.
 *
 * Сам ничего не считает: блокирующие execSync внутри пайплайна не дали бы
 * отправить heartbeat, поэтому работа живёт в child.mjs.
 */

import os from "os";
import { fork, type ChildProcess } from "child_process";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { failJob } from "@/lib/storage/job-store";
import { refundUse } from "@/lib/payment/refund";
import { EXIT_OK, EXIT_PERMANENT, EXIT_TRANSIENT } from "./errors";

const WORKER_ID = process.env.WORKER_ID || os.hostname();
const GIT_SHA = process.env.WORKER_GIT_SHA || "unknown";

const PING_MS = 10_000;
const HEARTBEAT_MS = 10_000;
const IDLE_POLL_MS = 3_000;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
/** Чуть меньше TimeoutStopSec=300 в юните: успеть вернуть задачу до SIGKILL от systemd. */
const SHUTDOWN_GRACE_MS = 280_000;
const MAX_ATTEMPTS = 2;

const ONCE = process.argv.includes("--once");
const VERBOSE = process.argv.includes("--verbose");

interface ClaimedJob {
  id: string;
  user_id: string | null;
  attempts: number;
  shadow_of: string | null;
}

let stopping = false;
let currentChild: ChildProcess | null = null;

function log(event: string, fields: Record<string, unknown> = {}): void {
  const tail = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.log(`[worker] ${event}${tail ? ` ${tail}` : ""}`);
}

function debug(event: string, fields: Record<string, unknown> = {}): void {
  if (VERBOSE) log(event, fields);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ping(): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("worker_ping", {
    p_worker_id: WORKER_ID,
    p_hostname: os.hostname(),
    p_git_sha: GIT_SHA,
  });
  if (error) log("ping-error", { message: error.message });
  else debug("ping", { workerId: WORKER_ID });
}

async function claimNextJob(): Promise<ClaimedJob | null> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_next_job", {
    p_worker_id: WORKER_ID,
  });
  if (error) {
    log("claim-error", { message: error.message });
    return null;
  }
  const rows = (data ?? []) as ClaimedJob[];
  return rows[0] ?? null;
}

async function heartbeat(jobId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("heartbeat_job", {
    p_job_id: jobId,
    p_worker_id: WORKER_ID,
  });
  if (error) log("heartbeat-error", { jobId, message: error.message });
  else debug("heartbeat", { jobId });
}

async function releaseJob(jobId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("release_job", {
    p_job_id: jobId,
    p_worker_id: WORKER_ID,
  });
  if (error) log("release-error", { jobId, message: error.message });
  else log("released", { jobId });
}

/** Ребёнок не смог довести задачу и не пометил её сам — решаем за него. */
async function handleTransient(job: ClaimedJob, reason: string): Promise<void> {
  if (job.attempts < MAX_ATTEMPTS) {
    log("retry", { jobId: job.id, attempts: job.attempts, reason });
    await releaseJob(job.id);
    return;
  }
  log("give-up", { jobId: job.id, attempts: job.attempts, reason });
  const message = "Не удалось обработать документ, попробуйте ещё раз";
  await failJob(job.id, message);
  if (!job.shadow_of) {
    await refundUse(job.user_id ?? undefined, job.id, message);
  }
}

interface ChildOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function runChild(jobId: string): { child: ChildProcess; done: Promise<ChildOutcome> } {
  const childPath = new URL("./child.mjs", import.meta.url).pathname;
  const child = fork(childPath, [jobId], {
    execPath: process.execPath,
    env: process.env,
    stdio: "inherit",
  });

  const done = new Promise<ChildOutcome>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", (error) => {
      log("child-spawn-error", { jobId, message: error.message });
      resolve({ code: EXIT_TRANSIENT, signal: null });
    });
  });

  return { child, done };
}

async function processJob(job: ClaimedJob): Promise<void> {
  log("claimed", { jobId: job.id, attempts: job.attempts, shadow: Boolean(job.shadow_of) });

  const { child, done } = runChild(job.id);
  currentChild = child;

  let timedOut = false;
  const beat = setInterval(() => {
    void heartbeat(job.id);
  }, HEARTBEAT_MS);
  const hardStop = setTimeout(() => {
    timedOut = true;
    log("timeout-kill", { jobId: job.id, timeoutMs: JOB_TIMEOUT_MS });
    child.kill("SIGKILL");
  }, JOB_TIMEOUT_MS);

  const { code, signal } = await done;
  clearInterval(beat);
  clearTimeout(hardStop);
  currentChild = null;

  if (code === EXIT_OK && !timedOut) {
    log("completed", { jobId: job.id });
    return;
  }
  if (code === EXIT_PERMANENT) {
    log("failed", { jobId: job.id });
    return;
  }
  // Убитый по таймауту или по остановке ребёнок считается временной ошибкой.
  const reason = timedOut ? "timeout" : `exit=${String(code)} signal=${String(signal)}`;
  await handleTransient(job, reason);
}

function installSignals(): void {
  let asked = 0;
  const onTerm = () => {
    asked += 1;
    stopping = true;
    if (!currentChild) {
      log("shutdown", { reason: "idle" });
      process.exit(0);
    }
    if (asked === 1) {
      log("shutdown", { reason: "waiting-for-child" });
      setTimeout(() => {
        if (currentChild) {
          log("shutdown-kill", {});
          currentChild.kill("SIGKILL");
        }
      }, SHUTDOWN_GRACE_MS).unref();
      return;
    }
    log("shutdown-kill", { reason: "second-signal" });
    currentChild?.kill("SIGKILL");
  };
  process.on("SIGTERM", onTerm);
  process.on("SIGINT", onTerm);
}

async function main(): Promise<void> {
  log("started", { workerId: WORKER_ID, gitSha: GIT_SHA, once: ONCE });
  installSignals();

  await ping();
  const pinger = setInterval(() => {
    void ping();
  }, PING_MS);

  try {
    while (!stopping) {
      const job = await claimNextJob();
      if (!job) {
        if (ONCE) break;
        await sleep(IDLE_POLL_MS);
        continue;
      }
      await processJob(job);
      if (ONCE) break;
    }
  } finally {
    clearInterval(pinger);
  }

  log("stopped", {});
  process.exit(0);
}

void main();
