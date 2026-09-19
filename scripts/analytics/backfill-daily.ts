/**
 * Бэкфилл дневных снапшотов аналитики (ADR-018).
 *
 * Запуск:
 *   npx tsx scripts/analytics/backfill-daily.ts --from=2026-01-01 --to=2026-09-18 \
 *     --out=/path/to/diplox-analytics
 *   npx tsx scripts/analytics/backfill-daily.ts --from=2026-09-17 --dry-run
 *
 * Без --from берётся самая ранняя дата из платежей и регистраций,
 * без --to — вчерашние UTC-сутки. Дни старше TTL получают partial-поля.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { buildDailySnapshot } from "../../src/lib/analytics/daily-snapshot";
import { getSupabaseAdmin } from "../../src/lib/supabase/admin";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function yesterdayUtc(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00.000Z`); t <= Date.parse(`${to}T00:00:00.000Z`); t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** Самая ранняя дата, за которую вообще есть что считать. */
async function earliestDay(): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("payments")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1);
  const firstPayment = (data as { created_at: string }[] | null)?.[0]?.created_at;

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const userDates = (usersData?.users ?? []).map((u) => u.created_at).sort();

  const candidates = [firstPayment, userDates[0]].filter((d): d is string => Boolean(d));
  if (candidates.length === 0) throw new Error("Нет ни платежей, ни пользователей — нечего бэкфиллить");
  return candidates.sort()[0].slice(0, 10);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const out = flag("out");
  const to = flag("to") ?? yesterdayUtc();
  const from = flag("from") ?? (await earliestDay());

  const admin = getSupabaseAdmin();
  const days = daysBetween(from, to);
  console.log(`Бэкфилл ${days.length} дней: ${from}..${to}${dryRun ? " (dry-run)" : ""}`);

  for (const day of days) {
    const snapshot = await buildDailySnapshot(day);

    if (dryRun) {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      const { error } = await admin
        .from("analytics_daily")
        .upsert({ day, data: snapshot, updated_at: new Date().toISOString() }, { onConflict: "day" });
      if (error) throw new Error(`upsert ${day}: ${error.message}`);

      if (out) {
        const dir = path.join(out, "daily");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${day}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
      }
    }

    console.log(
      `${day} reg=${snapshot.registrations} paid=${snapshot.payments.completed}` +
        ` rub=${snapshot.payments.revenue_rub} partial=${snapshot.partial.join(",") || "-"}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
