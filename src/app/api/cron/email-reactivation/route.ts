/**
 * GET /api/cron/email-reactivation — Реактивация неактивных юзеров
 * Юзеры, чья последняя обработка была 14-16 дней назад.
 * Schedule: ежедневно 12:00 UTC
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendLifecycleEmail, appendUnsubscribeFooter, getDaysUntilDeadline } from "@/lib/email/lifecycle";
import { reactivationEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const now = new Date();
  const from = new Date(now.getTime() - 16 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Находим юзеров, чей последний job был 14-16 дней назад
  const { data: recentJobs } = await admin
    .from("jobs")
    .select("user_id, created_at")
    .not("user_id", "is", null)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());

  if (!recentJobs?.length) {
    return NextResponse.json({ sent: 0 });
  }

  // Уникальные юзеры
  const userIds = [...new Set(recentJobs.map((j) => j.user_id))];

  const daysUntilDeadline = getDaysUntilDeadline();
  let sent = 0;

  for (const userId of userIds.slice(0, 100)) {
    try {
      // Проверяем: нет ли более свежих обработок
      const { data: latestJob } = await admin
        .from("jobs")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestJob) {
        const lastJobDate = new Date(latestJob.created_at);
        if (lastJobDate > to) continue; // Есть более свежая обработка
      }

      // Получаем email
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      if (!userData?.user?.email) continue;

      const html = appendUnsubscribeFooter(
        reactivationEmail({ daysUntilDeadline }),
        userId,
        "reactivation_14d"
      );

      const wasSent = await sendLifecycleEmail({
        userId,
        email: userData.user.email,
        emailType: "reactivation_14d",
        subject: daysUntilDeadline
          ? `До сдачи ~${daysUntilDeadline} дней — не забудь оформить работу`
          : "Давно не заходил — не забудь оформить работу",
        html,
      });

      if (wasSent) sent++;
      if (sent > 0) await sleep(50);
    } catch (err) {
      console.error(`[email-reactivation] Error for ${userId}:`, err);
    }
  }

  return NextResponse.json({ sent, checked: userIds.length });
}

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  return cronSecret === expected || authHeader === `Bearer ${expected}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
