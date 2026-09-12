/**
 * Юнит-тесты для refundUse() и markUseConsumed() из src/lib/payment/refund.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createThenableSupabaseMock } from "../../mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { refundUse, markUseConsumed } from "@/lib/payment/refund";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);

type Admin = ReturnType<typeof getSupabaseAdmin>;

describe("refundUse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает использование: заявка на job прошла → инкремент remaining_uses", async () => {
    const supabase = createThenableSupabaseMock(
      { jobs: [{ data: [{ id: "job-1" }], error: null }] },
      { data: 4, error: null }
    );
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const result = await refundUse("user-1", "job-1", "Превышено время обработки");

    expect(result).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("increment_remaining_uses", {
      p_user_id: "user-1",
    });
    // Возврат засчитывается только для списанных и ещё не возвращённых задач
    expect(supabase.calls["jobs.not"]).toHaveBeenCalledWith("use_consumed_at", "is", null);
    expect(supabase.calls["jobs.is"]).toHaveBeenCalledWith("use_refunded_at", null);
  });

  it("повторный возврат за ту же задачу — no-op", async () => {
    const supabase = createThenableSupabaseMock(
      {
        jobs: [
          { data: [{ id: "job-1" }], error: null },
          { data: [], error: null }, // use_refunded_at уже проставлен
        ],
      },
      { data: 4, error: null }
    );
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const first = await refundUse("user-1", "job-1", "fail");
    const second = await refundUse("user-1", "job-1", "fail");

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("задача без списания (use_consumed_at пустой) → возврата нет", async () => {
    const supabase = createThenableSupabaseMock(
      { jobs: [{ data: [], error: null }] },
      { data: 4, error: null }
    );
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const result = await refundUse("user-1", "job-1", "упало до списания");

    expect(result).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("анонимная задача (нет userId) → no-op без обращения к БД и без исключения", async () => {
    const supabase = createThenableSupabaseMock();
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(refundUse(undefined, "job-anon", "fail")).resolves.toBe(false);
    await expect(refundUse(null, "job-anon", "fail")).resolves.toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("инкремент не удался → отметка возврата снимается, возврат можно повторить", async () => {
    const supabase = createThenableSupabaseMock(
      {
        jobs: [{ data: [{ id: "job-1" }], error: null }],
        user_access: [{ data: null, error: { message: "not found" } }],
      },
      { data: null, error: { message: "rpc down" } }
    );
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const result = await refundUse("user-1", "job-1", "fail");

    expect(result).toBe(false);
    expect(supabase.calls["jobs.update"]).toHaveBeenCalledWith({ use_refunded_at: null });
  });
});

describe("markUseConsumed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("проставляет use_consumed_at на задаче", async () => {
    const supabase = createThenableSupabaseMock({ jobs: [{ data: null, error: null }] });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await markUseConsumed("job-1");

    expect(supabase.from).toHaveBeenCalledWith("jobs");
    expect(supabase.calls["jobs.eq"]).toHaveBeenCalledWith("id", "job-1");
    const payload = supabase.calls["jobs.update"].mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty("use_consumed_at");
  });
});
