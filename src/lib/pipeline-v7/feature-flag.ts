/**
 * Feature flag for the pipeline-v7 experiment.
 *
 * Rollout is a percentage of jobs, not of users: the bucket is derived from the
 * jobId, so the same job always takes the same branch (a retry of the same
 * upload gets a new jobId and may land differently — that is intended, the unit
 * of the experiment is the job, which is also the unit `feedback.rating` joins
 * on).
 *
 *   PIPELINE_V7_PERCENT — integer 0..100. Anything else (empty, NaN, out of
 *                         range) means 0, i.e. v7 off.
 *   PIPELINE_V7_FORCE=1 — always v7, for local testing. Ignores the percentage.
 */

/** FNV-1a, 32-bit. Stable across runtimes; no crypto import for a bucket. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in uint32 without BigInt.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Решение владельца 2026-09-14: весь ГОСТ-трафик идёт через v7 (fallback на v6 остаётся). */
const DEFAULT_PERCENT = 100;

function percent(): number {
  const raw = (process.env.PIPELINE_V7_PERCENT ?? "").trim();
  if (raw === "") return DEFAULT_PERCENT;
  if (!/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return 0;
  return n;
}

export function shouldUsePipelineV7(jobId: string): boolean {
  if (process.env.PIPELINE_V7_FORCE === "1") return true;
  const p = percent();
  if (p <= 0) return false;
  if (p >= 100) return true;
  return fnv1a(jobId) % 100 < p;
}
