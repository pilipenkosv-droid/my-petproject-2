/**
 * Юнит-тесты сборщика зависших задач (src/lib/storage/job-stuck.ts):
 * выбор порога (stuckCutoffFor) и self-heal на чтении статуса (failIfStuck).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createThenableSupabaseMock } from "../../../mocks/supabase";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));
vi.mock("@/lib/payment/refund", () => ({
  refundUse: vi.fn().mockResolvedValue(true),
  markUseConsumed: vi.fn().mockResolvedValue(undefined),
}));

import { failIfStuck, stuckCutoffFor, QUEUE_OVERLOADED_MESSAGE } from "@/lib/storage/job-stuck";
import { refundUse } from "@/lib/payment/refund";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
const mockRefundUse = vi.mocked(refundUse);

type Admin = ReturnType<typeof getSupabaseAdmin>;

const NOW = Date.parse("2026-09-18T12:00:00.000Z");
const INLINE_MS = 3 * 60 * 1000;
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000).toISOString();

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "formatting",
    user_id: "user-1",
    worker_id: null,
    worker_heartbeat_at: null,
    shadow_of: null,
    created_at: minutesAgo(10),
    updated_at: minutesAgo(10),
    ...overrides,
  };
}

/** Строка считается зависшей, если её «часы» ушли за вычисленный cutoff. */
function isStuck(candidate: ReturnType<typeof row>): boolean {
  const decision = stuckCutoffFor(
    candidate as unknown as Parameters<typeof stuckCutoffFor>[0],
    INLINE_MS,
    NOW
  );
  const clock = candidate[decision.column] as string;
  return clock < decision.cutoff;
}

describe("stuckCutoffFor", () => {
  it("инлайн: 3 минуты без движения → зависла", () => {
    expect(isStuck(row({ updated_at: minutesAgo(4) }))).toBe(true);
    expect(isStuck(row({ updated_at: minutesAgo(2) }))).toBe(false);
  });

  it("воркер со свежим heartbeat → не зависла", () => {
    const candidate = row({
      worker_id: "vds-1",
      worker_heartbeat_at: minutesAgo(1),
      updated_at: minutesAgo(9),
    });
    expect(stuckCutoffFor(candidate as never, INLINE_MS, NOW).column).toBe("worker_heartbeat_at");
    expect(isStuck(candidate)).toBe(false);
  });

  it("воркер с heartbeat 11 минут назад → зависла", () => {
    expect(
      isStuck(row({ worker_id: "vds-1", worker_heartbeat_at: minutesAgo(11) }))
    ).toBe(true);
  });

  it("pending 5 минут → не зависла, порог очереди 20 минут", () => {
    const candidate = row({ status: "pending", updated_at: minutesAgo(5) });
    expect(isStuck(candidate)).toBe(false);
    expect(stuckCutoffFor(candidate as never, INLINE_MS, NOW).message).toBe(
      QUEUE_OVERLOADED_MESSAGE
    );
  });

  it("pending 25 минут → зависла с сообщением про очередь", () => {
    const candidate = row({ status: "pending", updated_at: minutesAgo(25) });
    expect(isStuck(candidate)).toBe(true);
    expect(stuckCutoffFor(candidate as never, INLINE_MS, NOW).message).toBe(
      QUEUE_OVERLOADED_MESSAGE
    );
  });
});

describe("failIfStuck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefundUse.mockResolvedValue(true);
  });

  it("зависшая задача старше порога → failed + один возврат использования", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [
        { data: row(), error: null },
        { data: { ...row(), status: "failed", progress: 40, status_message: "Превышено время обработки", error: "Превышено время обработки" }, error: null },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const job = await failIfStuck("job-1", INLINE_MS);

    expect(job?.status).toBe("failed");
    expect(mockRefundUse).toHaveBeenCalledTimes(1);
    expect(mockRefundUse).toHaveBeenCalledWith("user-1", "job-1", "Превышено время обработки");
  });

  it("свежая задача → UPDATE не находит строку, возврата нет", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [
        { data: row({ updated_at: minutesAgo(0) }), error: null },
        { data: null, error: { code: "PGRST116", message: "not found" } },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    expect(await failIfStuck("job-fresh", INLINE_MS)).toBeNull();
    expect(mockRefundUse).not.toHaveBeenCalled();
  });

  it("задача вне STUCK_STATUSES → не читаем дальше и не трогаем", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: row({ status: "completed" }), error: null }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    expect(await failIfStuck("job-completed", INLINE_MS)).toBeNull();
    expect(mockRefundUse).not.toHaveBeenCalled();
  });

  it("анонимная зависшая задача (user_id = null) → failed, без возврата", async () => {
    const anon = row({ id: "job-anon", user_id: null });
    const supabase = createThenableSupabaseMock({
      jobs: [
        { data: anon, error: null },
        { data: { ...anon, status: "failed" }, error: null },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const job = await failIfStuck("job-anon", INLINE_MS);

    expect(job?.status).toBe("failed");
    expect(mockRefundUse).not.toHaveBeenCalled();
  });

  it("теневая задача → failed без возврата (списания на ней не было)", async () => {
    const shadow = row({ id: "job-1-shadow", shadow_of: "job-1", user_id: null });
    const supabase = createThenableSupabaseMock({
      jobs: [
        { data: shadow, error: null },
        { data: { ...shadow, status: "failed" }, error: null },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const job = await failIfStuck("job-1-shadow", INLINE_MS);

    expect(job?.status).toBe("failed");
    expect(mockRefundUse).not.toHaveBeenCalled();
  });
});
