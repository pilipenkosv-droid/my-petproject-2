import { NextRequest, NextResponse } from "next/server";
import { runCleanup } from "@/lib/storage/cleanup";

/**
 * API endpoint для очистки старых записей в БД и файлов в Storage.
 *
 * Два триггера (см. docs/DEPLOYMENT.md → «Cron-задачи»):
 *   1. crontab на Timeweb — GET /api/cleanup?secret=$CLEANUP_SECRET;
 *   2. Vercel Cron (vercel.json, раз в сутки) — GET /api/cleanup
 *      с заголовком Authorization: Bearer $CRON_SECRET.
 * Очистка идемпотентна, так что двойной запуск безвреден.
 */
export async function GET(request: NextRequest) {
  const cleanupSecret = process.env.CLEANUP_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  const secret = request.nextUrl.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");

  const bySecretParam = Boolean(cleanupSecret) && secret === cleanupSecret;
  const byCronHeader = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
  // Оба секрета не заданы — авторизация не настроена, поведение как раньше (открыт).
  const authRequired = Boolean(cleanupSecret) || Boolean(cronSecret);

  if (authRequired && !bySecretParam && !byCronHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCleanup();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 }
    );
  }
}
