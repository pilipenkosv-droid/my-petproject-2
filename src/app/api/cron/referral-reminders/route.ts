/**
 * GET /api/cron/referral-reminders — Еженедельное напоминание о реферальном прогрессе
 *
 * Запуск: понедельник 9:00 UTC (vercel.json: "0 9 * * 1")
 * Находит пользователей с 1+ регистрациями, не достигших первого порога (5),
 * и отправляет email-напоминание.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { REWARD_THRESHOLDS } from "@/lib/referral/utils";
import { sendEmail } from "@/lib/email/transport";
import { referralWeeklyReminderEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

export async function GET(req: NextRequest) {
  const isLocal = process.env.NODE_ENV === "development";
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  const isAuthorized =
    isLocal ||
    cronSecret === expectedSecret ||
    authHeader === `Bearer ${expectedSecret}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const firstThreshold = REWARD_THRESHOLDS[0].threshold;

  // Находим реферреров с 1+ регистрациями, но < firstThreshold
  const { data: referrers } = await admin
    .from("referral_events")
    .select("referrer_id")
    .eq("event_type", "registration");

  if (!referrers?.length) {
    return NextResponse.json({ sent: 0, message: "No active referrers" });
  }

  // Подсчитываем регистрации по рефереру
  const countByReferrer = new Map<string, number>();
  for (const row of referrers) {
    const current = countByReferrer.get(row.referrer_id) ?? 0;
    countByReferrer.set(row.referrer_id, current + 1);
  }

  // Фильтруем: только те, кто ещё не достиг первого порога
  const eligibleReferrers = Array.from(countByReferrer.entries()).filter(
    ([, count]) => count > 0 && count < firstThreshold
  );

  let sent = 0;

  for (const [referrerId, count] of eligibleReferrers) {
    try {
      // Получаем email реферера
      const { data: userData } = await admin.auth.admin.getUserById(referrerId);
      if (!userData?.user?.email) continue;

      // Получаем код реферера
      const { data: link } = await admin
        .from("referral_links")
        .select("code")
        .eq("user_id", referrerId)
        .single();

      if (!link?.code) continue;

      const referralUrl = `${SITE_URL}/api/referral/click?code=${link.code}`;

      const html = referralWeeklyReminderEmail({
        count,
        nextThreshold: firstThreshold,
        referralUrl,
      });

      await sendEmail({
        to: userData.user.email,
        subject: `Ещё ${firstThreshold - count} до бесплатного Pro`,
        html,
      });

      sent++;
    } catch (err) {
      console.error(`[referral-reminders] Error for ${referrerId}:`, err);
    }
  }

  return NextResponse.json({
    sent,
    eligible: eligibleReferrers.length,
    message: `Sent ${sent} referral reminders`,
  });
}
