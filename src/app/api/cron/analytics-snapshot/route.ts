import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildDailySnapshot } from "@/lib/analytics/daily-snapshot";

export const dynamic = "force-dynamic";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function yesterdayUtc(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  // Проверка авторизации: Vercel Cron (Authorization: Bearer) или ручной вызов (x-cron-secret)
  const isLocal = process.env.NODE_ENV === "development";
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  const isAuthorized = isLocal
    || cronSecret === expectedSecret
    || authHeader === `Bearer ${expectedSecret}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const day = req.nextUrl.searchParams.get("date") ?? yesterdayUtc();
  if (!DAY_RE.test(day)) {
    return NextResponse.json({ error: "Invalid date, expected YYYY-MM-DD" }, { status: 400 });
  }

  const snapshot = await buildDailySnapshot(day);

  const { error } = await getSupabaseAdmin()
    .from("analytics_daily")
    .upsert({ day, data: snapshot, updated_at: new Date().toISOString() }, { onConflict: "day" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(snapshot);
}
