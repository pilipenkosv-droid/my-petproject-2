/**
 * POST /api/referral/register — Привязать нового пользователя к реферреру
 *
 * Вызывается из auth/callback после регистрации.
 * Body: { userId, code }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getReferrerByCode,
  recordReferralEvent,
  getReferralStats,
} from "@/lib/referral/utils";
import { sendEmail } from "@/lib/email/transport";
import { referralRegisteredEmail } from "@/lib/email/templates";

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const referrer = await getReferrerByCode(code);
    if (!referrer) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Защита от самореферала
    if (referrer.userId === userId) {
      return NextResponse.json({ error: "Self-referral" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Проверяем, не привязан ли уже
    const { data: profile } = await admin
      .from("user_profiles")
      .select("referred_by_code")
      .eq("user_id", userId)
      .single();

    if (profile?.referred_by_code) {
      return NextResponse.json({ ok: true, alreadyReferred: true });
    }

    // Привязываем реферера
    await admin
      .from("user_profiles")
      .update({
        referred_by_code: code,
        referred_by_user_id: referrer.userId,
      })
      .eq("user_id", userId);

    // Записываем событие регистрации
    const sessionId = request.cookies.get("dlx_sid")?.value;
    await recordReferralEvent({
      referrerId: referrer.userId,
      code,
      eventType: "registration",
      sessionId,
      refereeId: userId,
    });

    // Награда реферера начисляется при оплате друга (в payment webhook)
    // Отправляем email рефереру о регистрации
    sendReferrerEmail(referrer.userId, false, undefined).catch(
      (err) => console.error("[referral/register] Email error:", err)
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[referral/register] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function sendReferrerEmail(
  referrerId: string,
  rewardGranted: boolean,
  rewardMonths?: number
) {
  const admin = getSupabaseAdmin();
  const { data: referrerUser } = await admin.auth.admin.getUserById(referrerId);
  if (!referrerUser?.user?.email) return;

  const stats = await getReferralStats(referrerId);

  const html = referralRegisteredEmail({
    count: stats.registrations,
    nextThreshold: stats.nextThreshold,
    nextRewardMonths: stats.nextRewardMonths,
    rewardGranted,
    rewardMonths,
  });

  await sendEmail({
    to: referrerUser.user.email,
    subject: rewardGranted
      ? `Поздравляем! Вы получили ${rewardMonths} мес. Pro бесплатно`
      : `+1! Осталось ${stats.nextThreshold - stats.registrations} до бесплатного Pro`,
    html,
  });
}
