/**
 * GET /api/cron/email-marathon-blast — Одноразовая рассылка "Дипломный марафон"
 * Все юзеры с 1+ обработками, зарегистрированные до начала кампании.
 * Запускается вручную или по расписанию.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendLifecycleEmail, appendUnsubscribeFooter } from "@/lib/email/lifecycle";
import { marathonBlastEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Находим юзеров с хотя бы 1 обработкой
  const { data: usersWithJobs } = await admin
    .from("jobs")
    .select("user_id")
    .not("user_id", "is", null);

  if (!usersWithJobs?.length) {
    return NextResponse.json({ sent: 0 });
  }

  const uniqueUserIds = [...new Set(usersWithJobs.map((j) => j.user_id))];

  let sent = 0;
  let skipped = 0;

  for (const userId of uniqueUserIds) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      if (!userData?.user?.email) {
        skipped++;
        continue;
      }

      const html = appendUnsubscribeFooter(
        marathonBlastEmail(),
        userId,
        "marathon_blast"
      );

      const wasSent = await sendLifecycleEmail({
        userId,
        email: userData.user.email,
        emailType: "marathon_blast",
        subject: "Сезон дипломов: пригласи группу — обрабатывайте вместе",
        html,
      });

      if (wasSent) sent++;
      else skipped++;

      // Задержка между отправками
      if (sent > 0 && sent % 10 === 0) await sleep(100);
    } catch (err) {
      console.error(`[marathon-blast] Error for ${userId}:`, err);
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, total: uniqueUserIds.length });
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
