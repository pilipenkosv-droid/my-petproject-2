import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fnv1a, shouldUsePipelineV7 } from "@/lib/pipeline-v7/feature-flag";

const KEYS = ["PIPELINE_V7_PERCENT", "PIPELINE_V7_FORCE"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

const ids = Array.from({ length: 2000 }, (_, i) => `job-${i}`);

describe("shouldUsePipelineV7", () => {
  it("по умолчанию включён для всех (решение 2026-09-14)", () => {
    expect(shouldUsePipelineV7("job-1")).toBe(true);
  });

  it("0 — никого, 100 — всех", () => {
    process.env.PIPELINE_V7_PERCENT = "0";
    expect(ids.some(shouldUsePipelineV7)).toBe(false);
    process.env.PIPELINE_V7_PERCENT = "100";
    expect(ids.every(shouldUsePipelineV7)).toBe(true);
  });

  it("не задано = 100 (дефолт), мусор в переменной = 0", () => {
    for (const raw of ["", " "]) {
      process.env.PIPELINE_V7_PERCENT = raw;
      expect(ids.every(shouldUsePipelineV7), raw).toBe(true);
    }
    for (const raw of ["abc", "-5", "101", "10.5", "1e2", "NaN"]) {
      process.env.PIPELINE_V7_PERCENT = raw;
      expect(ids.some(shouldUsePipelineV7), raw).toBe(false);
    }
  });

  it("детерминирован для одного jobId", () => {
    process.env.PIPELINE_V7_PERCENT = "37";
    const first = ids.map(shouldUsePipelineV7);
    expect(ids.map(shouldUsePipelineV7)).toEqual(first);
  });

  it("доля попаданий близка к проценту", () => {
    process.env.PIPELINE_V7_PERCENT = "10";
    const share = ids.filter(shouldUsePipelineV7).length / ids.length;
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.15);
  });

  it("бакеты вложены: кто попал в 10%, попадёт и в 50%", () => {
    process.env.PIPELINE_V7_PERCENT = "10";
    const ten = ids.filter(shouldUsePipelineV7);
    process.env.PIPELINE_V7_PERCENT = "50";
    expect(ten.every(shouldUsePipelineV7)).toBe(true);
  });

  it("FORCE=1 перебивает нулевой процент", () => {
    process.env.PIPELINE_V7_FORCE = "1";
    expect(shouldUsePipelineV7("job-1")).toBe(true);
  });

  it("fnv1a стабилен и укладывается в uint32", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
    for (const id of ids.slice(0, 50)) {
      expect(fnv1a(id)).toBeGreaterThanOrEqual(0);
      expect(fnv1a(id)).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
