/**
 * Юнит-тесты возврата использований в resetStuckJobs() из src/lib/storage/job-store.ts
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

import { resetStuckJobs } from "@/lib/storage/job-store";
import { refundUse } from "@/lib/payment/refund";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
const mockRefundUse = vi.mocked(refundUse);

type Admin = ReturnType<typeof getSupabaseAdmin>;

describe("resetStuckJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefundUse.mockResolvedValue(true);
  });

  it("каждой зависшей задаче с user_id — один возврат", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [
        {
          data: [
            { id: "job-a", user_id: "user-1" },
            { id: "job-b", user_id: "user-2" },
          ],
          error: null,
        },
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
      jobs: [{ data: [{ id: "job-anon", user_id: null }], error: null }],
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
        {
          data: [
            { id: "job-a", user_id: "user-1" },
            { id: "job-b", user_id: "user-2" },
          ],
          error: null,
        },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const count = await resetStuckJobs();

    expect(count).toBe(2);
    expect(mockRefundUse).toHaveBeenCalledTimes(2);
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
