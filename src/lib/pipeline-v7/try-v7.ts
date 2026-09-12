/**
 * The experiment's entry point: run v7 for the jobs the flag selects, and hand
 * the route either a ready legacy result or a one-word reason to run v6.
 *
 * Every failure mode is a fallback, never an error: v7 is on trial, so a bad
 * run must cost the user nothing but a few seconds. The reason string is what
 * later joins to `feedback.rating` — keep it short and stable.
 */

import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { FidelityGateError } from "./fingerprint/gate";
import { runPipelineV7 } from "./orchestrator";
import { adaptPipelineV7ToLegacy, type AccessType, type LegacyAdapterResult } from "./adapter-legacy";

/** Below the route's maxDuration (60 s), leaving room for the v6 retry. */
export const V7_TIMEOUT_MS = 40_000;

export type TryV7Result = { adapted: LegacyAdapterResult } | { fallback: string };

class V7Timeout extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const alarm = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new V7Timeout("v7 timeout")), ms);
  });
  return Promise.race([work, alarm]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function reasonFor(error: unknown): string {
  if (error instanceof V7Timeout) return "timeout";
  if (error instanceof FidelityGateError) return "gate";
  const name = error instanceof Error ? error.name : typeof error;
  return `error:${name}`;
}

export async function tryPipelineV7(
  sourceBuffer: Buffer,
  jobId: string,
  accessType: AccessType,
): Promise<TryV7Result> {
  try {
    const result = await withTimeout(
      runPipelineV7(sourceBuffer, {
        pack: GOST_7_32,
        documentId: jobId,
        textNormalization: true,
        llm: undefined,
      }),
      V7_TIMEOUT_MS,
    );
    if (result.report.refused) return { fallback: `refused:${result.report.refused}` };
    if (!result.report.gate.pass || !result.output) return { fallback: "gate" };
    return { adapted: await adaptPipelineV7ToLegacy(sourceBuffer, result, accessType) };
  } catch (error) {
    return { fallback: reasonFor(error) };
  }
}
