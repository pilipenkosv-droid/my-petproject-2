/**
 * Интеграционный тест: GET /api/health/worker.
 * Главное свойство — endpoint закрыт без секрета и отдаёт не-200, когда
 * воркер молчит: на это реагирует строка крона.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createThenableSupabaseMock } from "../../mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { GET } from "@/app/api/health/worker/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
type Admin = ReturnType<typeof getSupabaseAdmin>;

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();

function makeRequest(query = ""): NextRequest {
  return new NextRequest(new Request(`http://localhost/api/health/worker${query}`));
}

function supabaseWith(opts: {
  workers?: Array<Record<string, unknown>>;
  pending?: Array<{ created_at: string }>;
  failed24h?: number;
}) {
  return createThenableSupabaseMock({
    workers: [{ data: opts.workers ?? [], error: null }],
    jobs: [
      { data: opts.pending ?? [], error: null },
      { data: null, error: null, count: opts.failed24h ?? 0 },
    ],
  });
}

const savedSecret = process.env.CRON_SECRET;

describe("GET /api/health/worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "s3cret";
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedSecret;
  });

  it("без секрета → 401", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("секреты не заданы → всё равно 401 (в отличие от /api/cleanup)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("свежий heartbeat и пустая очередь → ok 200", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      supabaseWith({
        workers: [{ id: "vds-1", hostname: "vds", git_sha: "abc", last_seen_at: secondsAgo(5) }],
        failed24h: 2,
      }) as unknown as Admin
    );

    const ok = await GET(
      new NextRequest(
        new Request("http://localhost/api/health/worker", {
          headers: { authorization: "Bearer s3cret" },
        })
      )
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.status).toBe("ok");
    expect(body.pendingCount).toBe(0);
    expect(body.failed24h).toBe(2);
    expect(body.workers[0]).toMatchObject({ id: "vds-1", gitSha: "abc" });
  });

  it("воркеров нет → degraded 503", async () => {
    mockGetSupabaseAdmin.mockReturnValue(supabaseWith({}) as unknown as Admin);

    const res = await GET(
      new NextRequest(
        new Request("http://localhost/api/health/worker", {
          headers: { authorization: "Bearer s3cret" },
        })
      )
    );
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("degraded");
  });

  it("очередь стоит дольше 10 минут → degraded 503", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      supabaseWith({
        workers: [{ id: "vds-1", hostname: "vds", git_sha: "abc", last_seen_at: secondsAgo(5) }],
        pending: [{ created_at: secondsAgo(900) }],
      }) as unknown as Admin
    );

    const res = await GET(
      new NextRequest(
        new Request("http://localhost/api/health/worker", {
          headers: { authorization: "Bearer s3cret" },
        })
      )
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.oldestPendingAgeSec).toBeGreaterThan(600);
  });
});
