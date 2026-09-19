/**
 * Типы и чистая агрегация дневного снапшота (ADR-018).
 * Запросы к БД — в daily-snapshot.ts.
 */

// TTL таблиц, синхронно с cleanup.ts (jobs) и retention.ts (остальные).
const TTL_DAYS = { jobs: 30, downloads: 90, page_views: 30 } as const;

export type TtlTable = keyof typeof TTL_DAYS;

const UNSET = "(не указан)";

export interface JobRow {
  user_id: string | null;
  status: string;
  work_type: string | null;
  requirements_mode: string | null;
  has_full_version: boolean | null;
  referrer: string | null;
}

export interface PaymentRow {
  user_id: string | null;
  offer_type: string | null;
  amount: string | number;
  status: string;
  created_at: string;
  completed_at: string | null;
  unlock_job_id: string | null;
}

export interface FeedbackRow {
  rating: number;
  source: string | null;
}

export interface DownloadRow {
  file_type: string;
}

export interface UserRow {
  id: string;
  created_at: string;
}

export interface DayRows {
  users: UserRow[];
  jobs: JobRow[] | null;
  downloads: DownloadRow[] | null;
  page_views: number | null;
  payments_initiated: PaymentRow[];
  payments_completed: PaymentRow[];
  feedback: FeedbackRow[];
  cumulative: { users: number; payments_completed: number; revenue_rub: number };
}

export interface DailySnapshot {
  day: string;
  generated_at: string;
  schema: 1;
  partial: string[];
  registrations: number;
  page_views: number | null;
  jobs: {
    total: number;
    auth: number;
    anon: number;
    by_status: Record<string, number>;
    by_work_type: Record<string, number>;
    by_requirements_mode: Record<string, number>;
    full_version: number;
    top_referrers: { host: string; n: number }[];
  } | null;
  downloads: { total: number; original: number; formatted: number } | null;
  payments: {
    initiated: number;
    completed: number;
    failed: number;
    revenue_rub: number;
    by_offer_type: Record<string, { n: number; rub: number }>;
    hook: { attempts: number; completed: number };
    direct: { attempts: number; completed: number };
    median_hours_reg_to_pay: number | null;
  };
  csat: {
    reviews: number;
    avg: number | null;
    distribution: Record<string, number>;
    by_source: Record<string, number>;
  };
  cumulative: { users: number; payments_completed: number; revenue_rub: number };
}

export function dayRange(day: string): { start: string; end: string } {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Таблицы, чьи строки за этот день уже могли быть удалены по TTL. */
export function expiredTables(day: string, now: Date): TtlTable[] {
  const startMs = new Date(`${day}T00:00:00.000Z`).getTime();
  return (Object.keys(TTL_DAYS) as TtlTable[]).filter(
    (table) => now.getTime() - startMs > TTL_DAYS[table] * 86400000
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function count<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    acc[k] = (acc[k] ?? 0) + 1;
  }
  return acc;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return round2(value);
}

function topReferrers(jobs: JobRow[]): { host: string; n: number }[] {
  const hosts: Record<string, number> = {};
  for (const job of jobs) {
    if (!job.referrer) continue;
    let host: string;
    try {
      host = new URL(job.referrer).hostname;
    } catch {
      continue;
    }
    if (!host) continue;
    hosts[host] = (hosts[host] ?? 0) + 1;
  }
  return Object.entries(hosts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([host, n]) => ({ host, n }));
}

function aggregateJobs(jobs: JobRow[]): NonNullable<DailySnapshot["jobs"]> {
  return {
    total: jobs.length,
    auth: jobs.filter((j) => j.user_id).length,
    anon: jobs.filter((j) => !j.user_id).length,
    by_status: count(jobs, (j) => j.status),
    by_work_type: count(jobs, (j) => j.work_type || UNSET),
    by_requirements_mode: count(jobs, (j) => j.requirements_mode || UNSET),
    full_version: jobs.filter((j) => j.has_full_version).length,
    top_referrers: topReferrers(jobs),
  };
}

function aggregatePayments(
  initiated: PaymentRow[],
  completed: PaymentRow[],
  users: UserRow[]
): DailySnapshot["payments"] {
  const byOffer: Record<string, { n: number; rub: number }> = {};
  for (const p of completed) {
    const key = p.offer_type || UNSET;
    const slot = (byOffer[key] ??= { n: 0, rub: 0 });
    slot.n++;
    slot.rub = round2(slot.rub + Number(p.amount));
  }

  const registeredAt = new Map(users.map((u) => [u.id, u.created_at]));
  const hours = completed
    .map((p) => {
      const created = p.user_id ? registeredAt.get(p.user_id) : undefined;
      if (!created || !p.completed_at) return null;
      return (new Date(p.completed_at).getTime() - new Date(created).getTime()) / 3600000;
    })
    .filter((h): h is number => h !== null);

  return {
    initiated: initiated.length,
    completed: completed.length,
    failed: initiated.filter((p) => p.status === "failed").length,
    revenue_rub: round2(completed.reduce((sum, p) => sum + Number(p.amount), 0)),
    by_offer_type: byOffer,
    hook: {
      attempts: initiated.filter((p) => p.unlock_job_id).length,
      completed: completed.filter((p) => p.unlock_job_id).length,
    },
    direct: {
      attempts: initiated.filter((p) => !p.unlock_job_id).length,
      completed: completed.filter((p) => !p.unlock_job_id).length,
    },
    median_hours_reg_to_pay: median(hours),
  };
}

function aggregateCsat(feedback: FeedbackRow[]): DailySnapshot["csat"] {
  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const f of feedback) {
    const key = String(f.rating);
    if (key in distribution) distribution[key]++;
  }
  const avg =
    feedback.length > 0
      ? round2(feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length)
      : null;

  return {
    reviews: feedback.length,
    avg,
    distribution,
    by_source: count(feedback, (f) => f.source || UNSET),
  };
}

export function aggregateDay(
  day: string,
  rows: DayRows,
  opts: { now?: Date } = {}
): DailySnapshot {
  const now = opts.now ?? new Date();
  const { start, end } = dayRange(day);
  const partial = expiredTables(day, now);
  const isPartial = (table: TtlTable) => partial.includes(table);

  return {
    day,
    generated_at: now.toISOString(),
    schema: 1,
    partial,
    registrations: rows.users.filter((u) => u.created_at >= start && u.created_at < end).length,
    page_views: isPartial("page_views") ? null : rows.page_views,
    jobs: isPartial("jobs") || !rows.jobs ? null : aggregateJobs(rows.jobs),
    downloads:
      isPartial("downloads") || !rows.downloads
        ? null
        : {
            total: rows.downloads.length,
            original: rows.downloads.filter((d) => d.file_type === "original").length,
            formatted: rows.downloads.filter((d) => d.file_type === "formatted").length,
          },
    payments: aggregatePayments(rows.payments_initiated, rows.payments_completed, rows.users),
    csat: aggregateCsat(rows.feedback),
    cumulative: rows.cumulative,
  };
}
