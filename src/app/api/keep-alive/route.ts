import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Лёгкий ping-эндпоинт для предотвращения паузы Supabase-проекта
 * на Free-тире (пауза наступает после 7 дней без активности).
 * GET /api/keep-alive — вызывается cron-ом каждые 12 часов (vercel.json).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = getSupabaseAdmin();

  // Минимальный запрос к БД — достаточно, чтобы сбросить таймер паузы
  const { error } = await admin
    .from("rate_limits")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[keep-alive] DB ping failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
