/**
 * Дневной снапшот аналитики за UTC-сутки [day 00:00, day+1 00:00).
 *
 * jobs, download_events и page_views чистятся по TTL (src/lib/storage/cleanup.ts,
 * src/lib/storage/retention.ts), поэтому через месяц динамику воронки по ним
 * не восстановить. Снапшот — вечный агрегат: analytics_daily + приватный репо
 * diplox-analytics (ADR-018).
 *
 * Без импортов next/*: модуль работает и из скрипта бэкфилла (npx tsx).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  aggregateDay,
  dayRange,
  expiredTables,
  type DailySnapshot,
  type DayRows,
  type DownloadRow,
  type FeedbackRow,
  type JobRow,
  type PaymentRow,
  type UserRow,
} from "./daily-aggregate";

export { aggregateDay, dayRange, expiredTables };
export type { DailySnapshot, DayRows, DownloadRow, FeedbackRow, JobRow, PaymentRow, UserRow };

const PAGE_SIZE = 1000;

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function listAllUsers(admin: Admin): Promise<UserRow[]> {
  const users: UserRow[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw error;
    const batch = data?.users ?? [];
    if (batch.length === 0) break;
    users.push(...batch.map((u) => ({ id: u.id, created_at: u.created_at })));
    if (batch.length < PAGE_SIZE) break;
  }
  return users;
}

/** Суммы всех завершённых платежей до конца дня — с пагинацией, строк уже больше страницы. */
async function fetchCompletedAmounts(admin: Admin, end: string): Promise<number[]> {
  const amounts: number[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("payments")
      .select("amount")
      .eq("status", "completed")
      .lt("completed_at", end)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as { amount: string | number }[];
    amounts.push(...batch.map((p) => Number(p.amount)));
    if (batch.length < PAGE_SIZE) break;
  }
  return amounts;
}

export async function fetchDayRows(day: string, now: Date = new Date()): Promise<DayRows> {
  const admin = getSupabaseAdmin();
  const { start, end } = dayRange(day);
  const expired = expiredTables(day, now);

  const [users, jobsRes, downloadsRes, pageViewsRes, initiatedRes, completedRes, feedbackRes, cumulativeAmounts] =
    await Promise.all([
      listAllUsers(admin),
      expired.includes("jobs")
        ? null
        : admin
            .from("jobs")
            .select("user_id,status,work_type,requirements_mode,has_full_version,referrer")
            .is("shadow_of", null)
            .gte("created_at", start)
            .lt("created_at", end),
      expired.includes("downloads")
        ? null
        : admin.from("download_events").select("file_type").gte("created_at", start).lt("created_at", end),
      expired.includes("page_views")
        ? null
        : admin
            .from("page_views")
            .select("id", { head: true, count: "exact" })
            .gte("created_at", start)
            .lt("created_at", end),
      admin
        .from("payments")
        .select("user_id,offer_type,amount,status,created_at,completed_at,unlock_job_id")
        .gte("created_at", start)
        .lt("created_at", end),
      admin
        .from("payments")
        .select("user_id,offer_type,amount,status,created_at,completed_at,unlock_job_id")
        .eq("status", "completed")
        .gte("completed_at", start)
        .lt("completed_at", end),
      admin.from("feedback").select("rating,source").gte("created_at", start).lt("created_at", end),
      fetchCompletedAmounts(admin, end),
    ]);

  return {
    users,
    jobs: jobsRes ? ((jobsRes.data ?? []) as JobRow[]) : null,
    downloads: downloadsRes ? ((downloadsRes.data ?? []) as DownloadRow[]) : null,
    page_views: pageViewsRes ? (pageViewsRes.count ?? 0) : null,
    payments_initiated: (initiatedRes.data ?? []) as PaymentRow[],
    payments_completed: (completedRes.data ?? []) as PaymentRow[],
    feedback: (feedbackRes.data ?? []) as FeedbackRow[],
    cumulative: {
      users: users.filter((u) => u.created_at < end).length,
      payments_completed: cumulativeAmounts.length,
      revenue_rub: Math.round(cumulativeAmounts.reduce((sum, a) => sum + a, 0) * 100) / 100,
    },
  };
}

export async function buildDailySnapshot(day: string, now: Date = new Date()): Promise<DailySnapshot> {
  const rows = await fetchDayRows(day, now);
  return aggregateDay(day, rows, { now });
}
