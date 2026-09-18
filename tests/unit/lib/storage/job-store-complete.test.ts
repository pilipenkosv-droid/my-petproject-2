/**
 * Юнит-тесты completeJob(): результат не должен перезаписывать терминальный статус.
 *
 * Гонка: сборщик зависших посчитал задачу потерянной, пометил failed и вернул
 * списание, а осиротевший процесс воркера дорабатывает документ и зовёт
 * completeJob. Пользователь получил бы результат, за который деньги уже вернули.
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

import { completeJob } from "@/lib/storage/job-store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
type Admin = ReturnType<typeof getSupabaseAdmin>;

const RESULT = {
  markedOriginalId: "job-1_original",
  formattedDocumentId: "job-1_formatted",
  violations: [],
  statistics: {} as never,
  rules: {} as never,
};

describe("completeJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("обычная задача → completed", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [
        {
          data: {
            id: "job-1",
            status: "completed",
            progress: 100,
            status_message: "Обработка завершена",
            created_at: "2026-09-18T10:00:00.000Z",
            updated_at: "2026-09-18T10:01:00.000Z",
          },
          error: null,
        },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const job = await completeJob("job-1", RESULT);

    expect(job?.status).toBe("completed");
    const neq = supabase.calls["jobs.neq"].mock.calls;
    expect(neq).toContainEqual(["status", "failed"]);
    expect(neq).toContainEqual(["status", "completed"]);
  });

  it("задача уже failed → UPDATE не находит строку, возвращается null", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: null, error: { code: "PGRST116", message: "not found" } }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    expect(await completeJob("job-healed", RESULT)).toBeNull();
  });
});
