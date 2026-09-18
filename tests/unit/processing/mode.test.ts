/**
 * Юнит-тесты src/lib/processing/mode.ts — выбор режима обработки и
 * определение живого воркера.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThenableSupabaseMock } from "../../mocks/supabase";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import {
  getProcessingMode,
  workerPercent,
  isWorkerBucket,
  isWorkerAlive,
  shouldQueueForWorker,
} from "@/lib/processing/mode";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
type Admin = ReturnType<typeof getSupabaseAdmin>;

const ENV_KEYS = ["PROCESSING_MODE", "WORKER_PERCENT"] as const;
const saved: Record<string, string | undefined> = {};

function aliveWorker() {
  return createThenableSupabaseMock({ workers: [{ data: [{ id: "vds-1" }], error: null }] });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("getProcessingMode", () => {
  it("по умолчанию inline", () => {
    expect(getProcessingMode()).toBe("inline");
  });

  it("worker и shadow распознаются, регистр не важен", () => {
    process.env.PROCESSING_MODE = "worker";
    expect(getProcessingMode()).toBe("worker");
    process.env.PROCESSING_MODE = " Shadow ";
    expect(getProcessingMode()).toBe("shadow");
  });

  it("неизвестное значение → inline", () => {
    process.env.PROCESSING_MODE = "turbo";
    expect(getProcessingMode()).toBe("inline");
  });
});

describe("workerPercent / isWorkerBucket", () => {
  it("по умолчанию 100 % — все задачи в бакете", () => {
    expect(workerPercent()).toBe(100);
    expect(isWorkerBucket("job-1")).toBe(true);
  });

  it("0 % — ни одной задачи", () => {
    process.env.WORKER_PERCENT = "0";
    expect(isWorkerBucket("job-1")).toBe(false);
  });

  it("мусор и выход за 0..100 → 0 %", () => {
    process.env.WORKER_PERCENT = "abc";
    expect(workerPercent()).toBe(0);
    process.env.WORKER_PERCENT = "150";
    expect(workerPercent()).toBe(0);
  });

  it("решение по jobId устойчиво и делит поток примерно по проценту", () => {
    process.env.WORKER_PERCENT = "10";
    const first = isWorkerBucket("stable-job");
    expect(isWorkerBucket("stable-job")).toBe(first);

    const ids = Array.from({ length: 1000 }, (_, i) => `job-${i}`);
    const hits = ids.filter(isWorkerBucket).length;
    expect(hits).toBeGreaterThan(40);
    expect(hits).toBeLessThan(180);
  });
});

describe("isWorkerAlive", () => {
  it("есть свежая строка в workers → жив", async () => {
    mockGetSupabaseAdmin.mockReturnValue(aliveWorker() as unknown as Admin);
    expect(await isWorkerAlive()).toBe(true);
  });

  it("пустая выборка → мёртв", async () => {
    const supabase = createThenableSupabaseMock({ workers: [{ data: [], error: null }] });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);
    expect(await isWorkerAlive()).toBe(false);
  });

  it("ошибка запроса → мёртв (считаем инлайном)", async () => {
    const supabase = createThenableSupabaseMock({
      workers: [{ data: null, error: { message: "boom" } }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);
    expect(await isWorkerAlive()).toBe(false);
  });
});

describe("shouldQueueForWorker", () => {
  it("режим inline → очередь не используется, к БД не ходим", async () => {
    mockGetSupabaseAdmin.mockReturnValue(aliveWorker() as unknown as Admin);
    expect(await shouldQueueForWorker("job-1")).toBe(false);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("режим shadow → пользовательская задача всё равно идёт инлайном", async () => {
    process.env.PROCESSING_MODE = "shadow";
    mockGetSupabaseAdmin.mockReturnValue(aliveWorker() as unknown as Admin);
    expect(await shouldQueueForWorker("job-1")).toBe(false);
  });

  it("режим worker + живой воркер → в очередь", async () => {
    process.env.PROCESSING_MODE = "worker";
    mockGetSupabaseAdmin.mockReturnValue(aliveWorker() as unknown as Admin);
    expect(await shouldQueueForWorker("job-1")).toBe(true);
  });

  it("режим worker, но воркер молчит → инлайн (деградация)", async () => {
    process.env.PROCESSING_MODE = "worker";
    const supabase = createThenableSupabaseMock({ workers: [{ data: [], error: null }] });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);
    expect(await shouldQueueForWorker("job-1")).toBe(false);
  });

  it("режим worker, но задача вне бакета → инлайн", async () => {
    process.env.PROCESSING_MODE = "worker";
    process.env.WORKER_PERCENT = "0";
    mockGetSupabaseAdmin.mockReturnValue(aliveWorker() as unknown as Admin);
    expect(await shouldQueueForWorker("job-1")).toBe(false);
  });
});
