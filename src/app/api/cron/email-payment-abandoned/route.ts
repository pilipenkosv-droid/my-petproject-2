/**
 * GET /api/cron/email-payment-abandoned — Брошенная оплата
 * Юзеры с pending-платежом 25-35 мин назад, без completed за это время.
 * Schedule: каждые 30 минут
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  sendLifecycleEmail,
  appendUnsubscribeFooter,
} from "@/lib/email/lifecycle";
import { paymentAbandonedEmail } from "@/lib/email/templates";
import type { OfferType } from "@/lib/payment/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = Date.now();

  // Окно: платежи, инициированные 25-35 минут назад
  const from = new Date(now - 35 * 60 * 1000).toISOString();
  const to = new Date(now - 25 * 60 * 1000).toISOString();

  // Находим pending-платежи в окне
  const { data: pendingPayments, error } = await admin
    .from("payments")
    .select("id, user_id, offer_type, created_at")
    .eq("status", "pending")
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: false });

  if (error || !pendingPayments?.length) {
    return NextResponse.json({ sent: 0, checked: 0 });
  }

  // Группируем по user_id (берём только первый pending на юзера)
  const userPayments = new Map<
    string,
    { paymentId: string; offerType: OfferType }
  >();
  for (const p of pendingPayments) {
    if (!userPayments.has(p.user_id)) {
      userPayments.set(p.user_id, {
        paymentId: p.id,
        offerType: p.offer_type as OfferType,
      });
    }
  }

  let sent = 0;

  for (const [userId, { paymentId, offerType }] of userPayments) {
    try {
      // Проверяем: не появился ли completed-платёж за последний час
      const { count } = await admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "completed")
        .gte("created_at", new Date(now - 60 * 60 * 1000).toISOString());

      if ((count ?? 0) > 0) continue;

      // Получаем email пользователя
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      if (!userData?.user?.email) continue;

      const html = appendUnsubscribeFooter(
        paymentAbandonedEmail({ offerType }),
        userId,
        "payment_abandoned_30m"
      );

      const wasSent = await sendLifecycleEmail({
        userId,
        email: userData.user.email,
        emailType: "payment_abandoned_30m",
        jobId: paymentId,
        subject: "Оплата не завершена — вернись и заверши",
        html,
        metadata: { offerType, paymentId },
      });

      if (wasSent) sent++;
      if (sent > 0) await sleep(50);
    } catch (err) {
      console.error(`[email-payment-abandoned] Error for ${userId}:`, err);
    }
  }

  return NextResponse.json({ sent, checked: userPayments.size });
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
