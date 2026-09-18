/**
 * Юнит-тесты возврата использований в resetStuckJobs() из src/lib/storage/job-stuck.ts
 *
 * Пакетный проход теперь двухшаговый: выборка кандидатов, затем условный UPDATE
 * на каждую строку — поэтому в очереди мока сначала список, затем ответы UPDATE.
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

import { resetStuckJobs } from "@/lib/storage/job-stuck";
import { refundUse } from "@/lib/payment/refund";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
const mockRefundUse = vi.mocked(refundUse);

type Admin = ReturnType<typeof getSupabaseAdmin>;

const LONG_AGO = "2026-09-18T10:00:00.000Z";

function candidate(id: string, userId: string | null) {
  return {
    id,
    status: "formatting",
    user_id: userId,
    worker_id: null,
    worker_heartbeat_at: null,
    shadow_of: null,
    queued_at: null,
    created_at: LONG_AGO,
    updated_at: LONG_AGO,
  };
}

function healed(id: string, userId: string | null) {
  return {
    data: {
      ...candidate(id, userId),
      status: "failed",
      progress: 40,
      status_message: "Превышено время обработки",
      error: "Превышено время обработки",
    },
    error: null,
  };
}

describe("resetStuckJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefundUse.mockResolvedValue(true);
  });

  it("каждой зависшей задаче с user_id — один возврат", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [
        { data: [candidate("job-a", "user-1"), candidate("job-b", "user-2")], error: null },
        healed("job-a", "user-1"),
        healed("job-b", "user-2"),
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const count = await resetStuckJobs();

    expect(count).toBe(2);
    expect(mockRefundUse).toHaveBeenCalledTimes(2);
    expect(mockRefundUse).toHaveBeenCalledWith("user-1", "job-a", "Превышено время обработки");
    expect(mockRefundUse).toHaveBeenCalledWith("user-2", "job-b", "Превышено время обработки");
  });

  it("анонимная задача (user_id = null) → возврата нет, задача всё равно считается", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [
        { data: [candidate("job-anon", null)], error: null },
        healed("job-anon", null),
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const count = await resetStuckJobs();

    expect(count).toBe(1);
    expect(mockRefundUse).not.toHaveBeenCalled();
  });

  it("падение возврата не срывает обработку остальных задач", async () => {
    mockRefundUse
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(true);
    const supabase = createThenableSupabaseMock({
      jobs: [
        { data: [candidate("job-a", "user-1"), candidate("job-b", "user-2")], error: null },
        healed("job-a", "user-1"),
        healed("job-b", "user-2"),
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const count = await resetStuckJobs();

    expect(count).toBe(2);
    expect(mockRefundUse).toHaveBeenCalledTimes(2);
  });

  it("свежие строки отсеиваются фильтром по updated_at, а не построчно", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: [], error: null }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const count = await resetStuckJobs();

    expect(count).toBe(0);
    // Один запрос-выборка и ни одного UPDATE: построчной проверки не было.
    expect(supabase.calls["jobs.select"]).toHaveBeenCalledTimes(1);
    expect(supabase.calls["jobs.update"]).not.toHaveBeenCalled();
    const cutoff = supabase.calls["jobs.lt"].mock.calls[0];
    expect(cutoff[0]).toBe("updated_at");
    expect(new Date(cutoff[1] as string).getTime()).toBeLessThan(Date.now());
  });

  it("ошибка БД → 0 задач и ни одного возврата", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: null, error: { message: "boom" } }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const count = await resetStuckJobs();

    expect(count).toBe(0);
    expect(mockRefundUse).not.toHaveBeenCalled();
  });
});
