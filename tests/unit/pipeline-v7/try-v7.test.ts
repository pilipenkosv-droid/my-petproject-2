/**
 * Every v7 failure must degrade to a fallback string, never to a thrown error:
 * the route's contract is that the user's document is formatted either way.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FidelityGateError } from "@/lib/pipeline-v7/fingerprint/gate";
import type { V7Report, V7Result } from "@/lib/pipeline-v7/report-types";

const runPipelineV7 = vi.hoisted(() => vi.fn());
const adaptPipelineV7ToLegacy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/pipeline-v7/orchestrator", () => ({ runPipelineV7 }));
vi.mock("@/lib/pipeline-v7/adapter-legacy", () => ({ adaptPipelineV7ToLegacy }));

const { tryPipelineV7, V7_TIMEOUT_MS } = await import("@/lib/pipeline-v7/try-v7");

function report(over: Partial<V7Report> = {}): V7Report {
  return {
    documentId: "job-1",
    pack: "gost-7.32",
    classification: { histogram: {}, sources: {}, suspect: false, warnings: [], lowConfidence: [] },
    restyle: {},
    aux: {},
    gate: { pass: true, violations: [], allowed: [], diff: {} },
    checker: { sourceScore: 50, finalScoreUndef: 80, finalScoreRoles: 90, finalScore: 80, failed: [] },
    timings: { formatMs: 10, totalMs: 12 },
    ...over,
  } as unknown as V7Report;
}

const SOURCE = Buffer.from("source");

beforeEach(() => {
  runPipelineV7.mockReset();
  adaptPipelineV7ToLegacy.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("tryPipelineV7", () => {
  it("успех → адаптированный результат", async () => {
    const result: V7Result = { output: Buffer.from("out"), report: report() };
    runPipelineV7.mockResolvedValue(result);
    adaptPipelineV7ToLegacy.mockResolvedValue({ statistics: { pipelineVersion: "v7" } });

    const out = await tryPipelineV7(SOURCE, "job-1", "none");
    expect(out).toHaveProperty("adapted");
    expect(adaptPipelineV7ToLegacy).toHaveBeenCalledWith(SOURCE, result, "none");
    const [, opts] = runPipelineV7.mock.calls[0];
    expect(opts.documentId).toBe("job-1");
    expect(opts.textNormalization).toBe(true);
    expect(opts.llm).toBeUndefined();
  });

  it("FidelityGateError → fallback 'gate'", async () => {
    runPipelineV7.mockRejectedValue(new FidelityGateError("не прошёл", {} as never));
    expect(await tryPipelineV7(SOURCE, "job-1", "none")).toEqual({ fallback: "gate" });
  });

  it("гейт не пройден без исключения → fallback 'gate'", async () => {
    runPipelineV7.mockResolvedValue({ report: report({ gate: { pass: false } as never }) });
    expect(await tryPipelineV7(SOURCE, "job-1", "none")).toEqual({ fallback: "gate" });
    expect(adaptPipelineV7ToLegacy).not.toHaveBeenCalled();
  });

  it("отказ классификатора → fallback с причиной", async () => {
    runPipelineV7.mockResolvedValue({
      output: SOURCE,
      report: report({ refused: "classification_suspect" }),
    });
    expect(await tryPipelineV7(SOURCE, "job-1", "none")).toEqual({
      fallback: "refused:classification_suspect",
    });
  });

  it("любое исключение → fallback 'error:<name>'", async () => {
    runPipelineV7.mockRejectedValue(new TypeError("boom"));
    expect(await tryPipelineV7(SOURCE, "job-1", "none")).toEqual({ fallback: "error:TypeError" });
  });

  it("падение адаптера тоже уводит в fallback", async () => {
    runPipelineV7.mockResolvedValue({ output: Buffer.from("out"), report: report() });
    adaptPipelineV7ToLegacy.mockRejectedValue(new RangeError("bad"));
    expect(await tryPipelineV7(SOURCE, "job-1", "none")).toEqual({ fallback: "error:RangeError" });
  });

  it("зависший прогон → fallback 'timeout'", async () => {
    vi.useFakeTimers();
    runPipelineV7.mockReturnValue(new Promise(() => {}));
    const promise = tryPipelineV7(SOURCE, "job-1", "none");
    await vi.advanceTimersByTimeAsync(V7_TIMEOUT_MS + 1);
    expect(await promise).toEqual({ fallback: "timeout" });
  });
});
