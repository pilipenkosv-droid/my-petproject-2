import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Воркер пингует таблицу каждые 10 с; молчание дольше — повод для письма. */
const HEARTBEAT_DEGRADED_SEC = 120;

/** Задача, ждущая очереди дольше этого, означает затор. */
const OLDEST_PENDING_DEGRADED_SEC = 600;

interface WorkerRow {
  id: string;
  hostname: string | null;
  git_sha: string | null;
  last_seen_at: string;
}

function ageSec(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

/**
 * Здоровье VDS-воркера (ADR-016, шаг 7). Дёргается кроном раз в 15 минут:
 * при не-200 cron печатает тело в stdout и шлёт письмо по MAILTO.
 *
 * Авторизация — та же схема, что у /api/cleanup: Bearer CRON_SECRET или
 * ?secret=CLEANUP_SECRET. Отличие намеренное: если ни один секрет не задан,
 * endpoint закрыт (401), а не открыт — он показывает внутреннее состояние
 * очереди, и «по умолчанию открыт» здесь неприемлемо.
 */
export async function GET(request: NextRequest) {
  const cleanupSecret = process.env.CLEANUP_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  const secret = request.nextUrl.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");

  const bySecretParam = Boolean(cleanupSecret) && secret === cleanupSecret;
  const byCronHeader = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (!bySecretParam && !byCronHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Теневые задачи считаем наравне с обычными: для воркера это такая же работа.
  const [workersRes, pendingRes, failedRes] = await Promise.all([
    admin.from("workers").select("id, hostname, git_sha, last_seen_at").order("last_seen_at", { ascending: false }),
    admin.from("jobs").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1000),
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", dayAgo),
  ]);

  const workers = (workersRes.data ?? []) as WorkerRow[];
  const pending = (pendingRes.data ?? []) as Array<{ created_at: string }>;

  const heartbeatAgeSec = ageSec(workers[0]?.last_seen_at);
  const oldestPendingAgeSec = ageSec(pending[0]?.created_at);

  const degraded =
    workers.length === 0 ||
    heartbeatAgeSec === null ||
    heartbeatAgeSec > HEARTBEAT_DEGRADED_SEC ||
    (oldestPendingAgeSec !== null && oldestPendingAgeSec > OLDEST_PENDING_DEGRADED_SEC);

  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      heartbeatAgeSec,
      pendingCount: pending.length,
      oldestPendingAgeSec,
      failed24h: failedRes.count ?? 0,
      workers: workers.map((w) => ({
        id: w.id,
        hostname: w.hostname,
        gitSha: w.git_sha,
        lastSeenAt: w.last_seen_at,
      })),
    },
    { status: degraded ? 503 : 200 }
  );
}
