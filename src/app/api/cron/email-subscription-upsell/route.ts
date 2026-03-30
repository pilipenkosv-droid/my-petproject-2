/**
 * GET /api/cron/email-subscription-upsell — Апселл подписки
 * Юзеры с 3+ разовых покупок, не на подписке.
 * Schedule: ежедневно 11:00 UTC
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendLifecycleEmail, appendUnsubscribeFooter } from "@/lib/email/lifecycle";
import { subscriptionUpsellEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Находим юзеров с 3+ завершённых разовых покупок
  const { data: payments } = await admin
    .from("payments")
    .select("user_id")
    .eq("offer_type", "one_time")
    .eq("status", "completed");

  if (!payments?.length) {
    return NextResponse.json({ sent: 0 });
  }

  // Подсчитываем покупки по юзеру
  const countByUser = new Map<string, number>();
  for (const p of payments) {
    const current = countByUser.get(p.user_id) ?? 0;
    countByUser.set(p.user_id, current + 1);
  }

  // Фильтруем: 3+ покупок
  const eligible = Array.from(countByUser.entries()).filter(
    ([, count]) => count >= 3
  );

  let sent = 0;

  for (const [userId, purchaseCount] of eligible.slice(0, 100)) {
    try {
      // Проверяем: не на подписке ли уже
      const { data: access } = await admin
        .from("user_access")
        .select("access_type, subscription_active_until")
        .eq("user_id", userId)
        .single();

      if (access?.access_type === "subscription" || access?.access_type === "subscription_plus") {
        if (access.subscription_active_until && new Date(access.subscription_active_until) > new Date()) {
          continue; // Уже на активной подписке
        }
      }

      // Получаем email
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      if (!userData?.user?.email) continue;

      const totalSpent = purchaseCount * 159;

      const html = appendUnsubscribeFooter(
        subscriptionUpsellEmail({ totalSpent, purchaseCount }),
        userId,
        "subscription_upsell"
      );

      const wasSent = await sendLifecycleEmail({
        userId,
        email: userData.user.email,
        emailType: "subscription_upsell",
        subject: `Ты потратил ${totalSpent.toLocaleString("ru-RU")} ₽ — Pro выгоднее`,
        html,
        metadata: { totalSpent, purchaseCount },
      });

      if (wasSent) sent++;
      if (sent > 0) await sleep(50);
    } catch (err) {
      console.error(`[email-upsell] Error for ${userId}:`, err);
    }
  }

  return NextResponse.json({ sent, eligible: eligible.length });
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
