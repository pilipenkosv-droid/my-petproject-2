/**
 * Юнит-тесты для refundUse(), markUseConsumed() и compensateConsume()
 * из src/lib/payment/refund.ts.
 *
 * Возврат целиком уехал в RPC refund_job_use (migration-023): заявка на job и
 * инкремент remaining_uses идут одной транзакцией, откатов на стороне Node нет.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createThenableSupabaseMock } from "../../mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { refundUse, markUseConsumed, compensateConsume } from "@/lib/payment/refund";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Мок только с rpc — refundUse/compensateConsume к таблицам не ходят. */
function rpcOnlyMock(response: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: vi.fn().mockResolvedValue(response),
    from: vi.fn(),
  };
}

describe("refundUse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("RPC вернула true → использование возвращено", async () => {
    const supabase = rpcOnlyMock({ data: true, error: null });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const result = await refundUse("user-1", "job-1", "Превышено время обработки");

    expect(result).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("refund_job_use", {
      p_job_id: "job-1",
      p_user_id: "user-1",
    });
    // Никаких прямых правок jobs/user_access мимо транзакции
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("RPC вернула false (повтор или задача без списания) → возврата нет", async () => {
    const supabase = rpcOnlyMock({ data: false, error: null });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(refundUse("user-1", "job-1", "упало до списания")).resolves.toBe(false);
  });

  it("RPC недоступна (миграция не применена) → false, без падения", async () => {
    const supabase = rpcOnlyMock({
      data: null,
      error: { message: 'function public.refund_job_use(text, uuid) does not exist' },
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(refundUse("user-1", "job-1", "fail")).resolves.toBe(false);
  });

  it("анонимная задача (нет userId) → no-op без обращения к БД", async () => {
    const supabase = rpcOnlyMock({ data: true, error: null });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(refundUse(undefined, "job-anon", "fail")).resolves.toBe(false);
    await expect(refundUse(null, "job-anon", "fail")).resolves.toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("compensateConsume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("инкрементит remaining_uses через RPC", async () => {
    const supabase = rpcOnlyMock({ data: 4, error: null });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const result = await compensateConsume("user-1");

    expect(result).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("increment_remaining_uses", {
      p_user_id: "user-1",
    });
  });

  it("нет строки user_access (RPC вернула -1) → false", async () => {
    const supabase = rpcOnlyMock({ data: -1, error: null });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(compensateConsume("user-1")).resolves.toBe(false);
  });

  it("ошибка RPC → false", async () => {
    const supabase = rpcOnlyMock({ data: null, error: { message: "rpc down" } });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(compensateConsume("user-1")).resolves.toBe(false);
  });
});

describe("markUseConsumed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("проставляет use_consumed_at на задаче и возвращает true", async () => {
    const supabase = createThenableSupabaseMock({ jobs: [{ data: null, error: null }] });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(markUseConsumed("job-1")).resolves.toBe(true);

    expect(supabase.from).toHaveBeenCalledWith("jobs");
    expect(supabase.calls["jobs.eq"]).toHaveBeenCalledWith("id", "job-1");
    const payload = supabase.calls["jobs.update"].mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty("use_consumed_at");
  });

  it("update упал → false (вызывающий обязан компенсировать списание)", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: null, error: { message: "update failed" } }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    await expect(markUseConsumed("job-1")).resolves.toBe(false);
  });
});
