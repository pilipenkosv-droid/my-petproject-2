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
  checkAndGrantRewards,
} from "@/lib/referral/utils";
import { activateAccess } from "@/lib/payment/access";
import { sendEmail } from "@/lib/email/transport";
import { referralRegisteredEmail } from "@/lib/email/templates";
import { getReferralStats } from "@/lib/referral/utils";

const REFERRAL_BONUS_USES = 3;

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

    // Бонус приглашённому: +3 бесплатных обработки
    const currentAccess = await admin
      .from("user_access")
      .select("remaining_uses")
      .eq("user_id", userId)
      .single();

    const currentUses = currentAccess.data?.remaining_uses ?? 0;
    await admin.from("user_access").upsert(
      {
        user_id: userId,
        access_type: "one_time",
        remaining_uses: currentUses + REFERRAL_BONUS_USES,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Проверяем награды для реферера
    const rewardResult = await checkAndGrantRewards(referrer.userId);

    // Отправляем email рефереру (в фоне)
    sendReferrerEmail(referrer.userId, rewardResult.granted, rewardResult.months).catch(
      (err) => console.error("[referral/register] Email error:", err)
    );

    return NextResponse.json({
      ok: true,
      bonusUses: REFERRAL_BONUS_USES,
      rewardGranted: rewardResult.granted,
    });
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
