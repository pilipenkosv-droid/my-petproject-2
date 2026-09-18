/**
 * Юнит-тесты failIfStuck() из src/lib/storage/job-store.ts
 * (self-heal на чтении статуса — GET /api/status/[jobId])
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

import { failIfStuck } from "@/lib/storage/job-store";
import { refundUse } from "@/lib/payment/refund";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
const mockRefundUse = vi.mocked(refundUse);

type Admin = ReturnType<typeof getSupabaseAdmin>;

function stuckRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "failed",
    progress: 40,
    status_message: "Превышено время обработки",
    user_id: "user-1",
    created_at: "2026-09-18T10:00:00.000Z",
    updated_at: "2026-09-18T10:03:30.000Z",
    error: "Превышено время обработки",
    ...overrides,
  };
}

describe("failIfStuck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefundUse.mockResolvedValue(true);
  });

  it("зависшая задача старше порога → failed + один возврат использования", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: stuckRow(), error: null }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const job = await failIfStuck("job-1", 3 * 60 * 1000);

    expect(job).not.toBeNull();
    expect(job?.status).toBe("failed");
    expect(mockRefundUse).toHaveBeenCalledTimes(1);
    expect(mockRefundUse).toHaveBeenCalledWith(
      "user-1",
      "job-1",
      "Превышено время обработки"
    );
  });

  it("свежая задача (updated_at внутри порога) → не тронута, UPDATE не находит строку", async () => {
    // UPDATE ... WHERE status IN (...) AND updated_at < cutoff — не совпало,
    // PostgREST .single() без строки возвращает ошибку PGRST116.
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: null, error: { code: "PGRST116", message: "not found" } }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const job = await failIfStuck("job-fresh", 3 * 60 * 1000);

    expect(job).toBeNull();
    expect(mockRefundUse).not.toHaveBeenCalled();
  });

  it("уже завершённая задача (status вне STUCK_STATUSES) → не тронута", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: null, error: { code: "PGRST116", message: "not found" } }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const job = await failIfStuck("job-completed", 3 * 60 * 1000);

    expect(job).toBeNull();
    expect(mockRefundUse).not.toHaveBeenCalled();
  });

  it("анонимная зависшая задача (user_id = null) → failed, без возврата", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: stuckRow({ id: "job-anon", user_id: null }), error: null }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const job = await failIfStuck("job-anon", 3 * 60 * 1000);

    expect(job).not.toBeNull();
    expect(job?.status).toBe("failed");
    expect(mockRefundUse).not.toHaveBeenCalled();
  });
});
