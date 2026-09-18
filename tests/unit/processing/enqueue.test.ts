/**
 * Юнит-тесты src/lib/processing/enqueue.ts.
 *
 * Главное свойство: вторая постановка той же задачи в очередь (форматирование
 * после разбора методички) должна быть видна claim_next_job — он берёт только
 * строки с worker_id IS NULL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createThenableSupabaseMock } from "../../mocks/supabase";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { markJobQueued } from "@/lib/processing/enqueue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
type Admin = ReturnType<typeof getSupabaseAdmin>;

beforeEach(() => vi.clearAllMocks());

describe("markJobQueued", () => {
  it("сбрасывает колонки захвата и попытки, пишет переданное сообщение", async () => {
    const supabase = createThenableSupabaseMock({ jobs: [{ data: null, error: null }] });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    const ok = await markJobQueued("job-1", "В очереди на форматирование");

    expect(ok).toBe(true);
    const update = supabase.calls["jobs.update"].mock.calls[0][0] as Record<string, unknown>;
    expect(update.status).toBe("pending");
    expect(update.status_message).toBe("В очереди на форматирование");
    expect(update.worker_id).toBeNull();
    expect(update.worker_claimed_at).toBeNull();
    expect(update.worker_heartbeat_at).toBeNull();
    expect(update.attempts).toBe(0);
    expect(update.queued_at).toEqual(expect.any(String));
    expect(supabase.calls["jobs.eq"]).toHaveBeenCalledWith("id", "job-1");
  });

  it("ошибка UPDATE → false", async () => {
    const supabase = createThenableSupabaseMock({
      jobs: [{ data: null, error: { message: "boom" } }],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as unknown as Admin);

    expect(await markJobQueued("job-1", "В очереди")).toBe(false);
  });
});
