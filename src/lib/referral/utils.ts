/**
 * Серверная логика реферальной системы Diplox
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { nanoid } from "nanoid";
import { extendSubscription } from "@/lib/payment/access";

const REFERRAL_BONUS_PER_PAYMENT = 1;

export const REWARD_THRESHOLDS = [
  { threshold: 1, rewardType: "uses" as const, uses: 1 },
  { threshold: 5, rewardType: "months" as const, months: 1 },
  { threshold: 15, rewardType: "months" as const, months: 3 },
  { threshold: 30, rewardType: "months" as const, months: 6 },
] as const;

export interface ReferralStats {
  clicks: number;
  registrations: number;
  nextThreshold: number;
  nextRewardMonths: number;
  nextRewardDescription: string;
  rewards: Array<{ threshold: number; rewardMonths: number; grantedAt: string }>;
}

interface RecordEventParams {
  referrerId: string;
  code: string;
  eventType: "click" | "registration" | "first_job";
  sessionId?: string;
  refereeId?: string;
}

/**
 * Генерирует уникальный реферальный код
 */
export function generateReferralCode(): string {
  return nanoid(10);
}

/**
 * Возвращает существующий реферальный код пользователя или создаёт новый
 */
export async function getOrCreateReferralLink(
  userId: string
): Promise<{ code: string }> {
  const supabase = getSupabaseAdmin();

  // Проверяем существующую ссылку
  const { data: existing } = await supabase
    .from("referral_links")
    .select("code")
    .eq("user_id", userId)
    .single();

  if (existing) {
    return { code: existing.code };
  }

  const code = generateReferralCode();

  const { data: inserted, error } = await supabase
    .from("referral_links")
    .insert({ user_id: userId, code })
    .select("code")
    .single();

  if (error) {
    // Race condition: другой запрос уже вставил запись — читаем повторно
    const { data: fallback } = await supabase
      .from("referral_links")
      .select("code")
      .eq("user_id", userId)
      .single();

    if (fallback) {
      return { code: fallback.code };
    }

    throw new Error(`Failed to create referral link: ${error.message}`);
  }

  return { code: inserted.code };
}

/**
 * Записывает реферальное событие (клик, регистрация, первый заказ)
 */
export async function recordReferralEvent(
  params: RecordEventParams
): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase.from("referral_events").insert({
    referrer_id: params.referrerId,
    code: params.code,
    event_type: params.eventType,
    session_id: params.sessionId ?? null,
    referee_id: params.refereeId ?? null,
  });
}

/**
 * Возвращает статистику реферальной программы для пользователя
 */
export async function getReferralStats(
  userId: string
): Promise<ReferralStats> {
  const supabase = getSupabaseAdmin();

  // Считаем клики (уникальные session_id) и оплатившие рефералы
  const { data: events } = await supabase
    .from("referral_events")
    .select("event_type, session_id")
    .eq("referrer_id", userId);

  const allEvents = events ?? [];

  const uniqueSessionIds = new Set(
    allEvents
      .filter((e) => e.event_type === "click" && e.session_id)
      .map((e) => e.session_id)
  );
  const clicks = uniqueSessionIds.size;

  const registrations = allEvents.filter(
    (e) => e.event_type === "payment"
  ).length;

  // Получаем уже выданные награды
  const { data: rewardsData } = await supabase
    .from("referral_rewards")
    .select("threshold, reward_months, granted_at")
    .eq("user_id", userId)
    .order("granted_at", { ascending: true });

  const rewards = (rewardsData ?? []).map((r) => ({
    threshold: r.threshold,
    rewardMonths: r.reward_months,
    grantedAt: r.granted_at,
  }));

  const grantedThresholds = new Set(rewards.map((r) => r.threshold));

  // Вычисляем следующий порог
  const nextEntry = REWARD_THRESHOLDS.find(
    (t) => !grantedThresholds.has(t.threshold)
  );

  const lastEntry = REWARD_THRESHOLDS[REWARD_THRESHOLDS.length - 1];
  const nextThreshold = nextEntry?.threshold ?? lastEntry.threshold;
  const nextRewardMonths = nextEntry && nextEntry.rewardType === "months" ? nextEntry.months : 0;
  const nextRewardDescription = nextEntry
    ? nextEntry.rewardType === "uses"
      ? `+${nextEntry.uses} бесплатная обработка`
      : `${nextEntry.months} мес. Pro бесплатно`
    : `${lastEntry.rewardType === "months" ? lastEntry.months : 0} мес. Pro бесплатно`;

  return { clicks, registrations, nextThreshold, nextRewardMonths, nextRewardDescription, rewards };
}

/**
 * Проверяет достигнутые пороги и выдаёт реферальные награды
 */
export async function checkAndGrantRewards(
  userId: string
): Promise<{ granted: boolean; months?: number }> {
  const supabase = getSupabaseAdmin();

  // Считаем оплатившие рефералы
  const { count: paymentCount } = await supabase
    .from("referral_events")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", userId)
    .eq("event_type", "payment");

  const registrations = paymentCount ?? 0;

  // Получаем уже выданные награды
  const { data: existingRewards } = await supabase
    .from("referral_rewards")
    .select("threshold")
    .eq("user_id", userId);

  const grantedThresholds = new Set(
    (existingRewards ?? []).map((r) => r.threshold)
  );

  let granted = false;
  let highestGrantedMonths: number | undefined;

  for (const reward of REWARD_THRESHOLDS) {
    if (registrations >= reward.threshold && !grantedThresholds.has(reward.threshold)) {
      const rewardMonths = reward.rewardType === "months" ? reward.months : 0;

      // Записываем награду
      await supabase.from("referral_rewards").insert({
        user_id: userId,
        threshold: reward.threshold,
        reward_months: rewardMonths,
        granted_at: new Date().toISOString(),
      });

      if (reward.rewardType === "months") {
        // Продлеваем подписку
        await extendSubscription(userId, reward.months);
        highestGrantedMonths = reward.months;
      } else if (reward.rewardType === "uses") {
        // Добавляем бонусные обработки
        const { data: currentAccess } = await supabase
          .from("user_access")
          .select("remaining_uses")
          .eq("user_id", userId)
          .single();

        const currentUses = currentAccess?.remaining_uses ?? 0;
        await supabase.from("user_access").upsert(
          {
            user_id: userId,
            access_type: "one_time",
            remaining_uses: currentUses + reward.uses,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      }

      console.log("[referral_reward]", {
        userId, threshold: reward.threshold,
        rewardType: reward.rewardType,
        registrations,
      });

      granted = true;
    }
  }

  if (granted) {
    return { granted: true, months: highestGrantedMonths };
  }

  return { granted: false };
}

/**
 * Возвращает владельца реферальной ссылки по коду
 */
export async function getReferrerByCode(
  code: string
): Promise<{ userId: string } | null> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("referral_links")
    .select("user_id")
    .eq("code", code)
    .single();

  if (!data) return null;

  return { userId: data.user_id };
}

/**
 * Начисляет реферальный бонус (+1 обработка) рефереру при оплате друга.
 * Идемпотентно: один платёж друга = одно начисление.
 * Также проверяет пороговые награды (Pro месяцы).
 */
export async function grantReferrerBonusForPayment(
  refereeId: string
): Promise<{ granted: boolean; referrerId?: string }> {
  const supabase = getSupabaseAdmin();

  // Находим реферера по профилю приглашённого
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("referred_by_user_id, referred_by_code")
    .eq("user_id", refereeId)
    .single();

  if (!profile?.referred_by_user_id || !profile?.referred_by_code) {
    return { granted: false };
  }

  const referrerId = profile.referred_by_user_id;
  const code = profile.referred_by_code;

  // Идемпотентность: проверяем, не записывали ли уже payment-событие для этого referee
  const { count: existingPaymentEvents } = await supabase
    .from("referral_events")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", referrerId)
    .eq("referee_id", refereeId)
    .eq("event_type", "payment");

  if ((existingPaymentEvents ?? 0) > 0) {
    return { granted: false, referrerId };
  }

  // Записываем payment-событие
  await supabase.from("referral_events").insert({
    referrer_id: referrerId,
    referee_id: refereeId,
    code,
    event_type: "payment",
  });

  // Начисляем +1 обработку рефереру
  const { data: currentAccess } = await supabase
    .from("user_access")
    .select("remaining_uses")
    .eq("user_id", referrerId)
    .single();

  const currentUses = currentAccess?.remaining_uses ?? 0;
  await supabase.from("user_access").upsert(
    {
      user_id: referrerId,
      access_type: "one_time",
      remaining_uses: currentUses + REFERRAL_BONUS_PER_PAYMENT,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  console.log("[referral_payment_bonus]", {
    referrerId,
    refereeId,
    bonus: REFERRAL_BONUS_PER_PAYMENT,
  });

  // Проверяем пороговые награды (Pro месяцы за 5/15/30 друзей)
  await checkAndGrantRewards(referrerId);

  return { granted: true, referrerId };
}
