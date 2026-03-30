/**
 * Серверная логика реферальной системы Diplox
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { nanoid } from "nanoid";
import { extendSubscription } from "@/lib/payment/access";

const DEFAULT_REFERRAL_BONUS = 3;

export const REWARD_THRESHOLDS = [
  { threshold: 5, months: 1 },
  { threshold: 15, months: 3 },
  { threshold: 30, months: 6 },
] as const;

export interface ReferralStats {
  clicks: number;
  registrations: number;
  nextThreshold: number;
  nextRewardMonths: number;
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

  // Считаем клики (уникальные session_id) и регистрации
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
    (e) => e.event_type === "registration"
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

  const nextThreshold = nextEntry?.threshold ?? REWARD_THRESHOLDS[REWARD_THRESHOLDS.length - 1].threshold;
  const nextRewardMonths = nextEntry?.months ?? REWARD_THRESHOLDS[REWARD_THRESHOLDS.length - 1].months;

  return { clicks, registrations, nextThreshold, nextRewardMonths, rewards };
}

/**
 * Проверяет достигнутые пороги и выдаёт реферальные награды
 */
export async function checkAndGrantRewards(
  userId: string
): Promise<{ granted: boolean; months?: number }> {
  const supabase = getSupabaseAdmin();

  // Считаем регистрации
  const { count: registrationCount } = await supabase
    .from("referral_events")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", userId)
    .eq("event_type", "registration");

  const registrations = registrationCount ?? 0;

  // Получаем уже выданные награды
  const { data: existingRewards } = await supabase
    .from("referral_rewards")
    .select("threshold")
    .eq("user_id", userId);

  const grantedThresholds = new Set(
    (existingRewards ?? []).map((r) => r.threshold)
  );

  let highestGrantedMonths: number | undefined;

  for (const { threshold, months } of REWARD_THRESHOLDS) {
    if (registrations >= threshold && !grantedThresholds.has(threshold)) {
      // Записываем награду
      await supabase.from("referral_rewards").insert({
        user_id: userId,
        threshold,
        reward_months: months,
        granted_at: new Date().toISOString(),
      });

      // Продлеваем подписку
      await extendSubscription(userId, months);

      highestGrantedMonths = months;
    }
  }

  if (highestGrantedMonths !== undefined) {
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
 * Возвращает количество бонусных обработок для приглашённого.
 * Если активна сезонная кампания — возвращает повышенный бонус.
 */
export async function getCampaignBonusUses(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("campaign_config")
      .select("value")
      .eq("key", "marathon_2026")
      .single();

    if (!data?.value) return DEFAULT_REFERRAL_BONUS;

    const config = data.value as {
      active?: boolean;
      starts_at?: string;
      ends_at?: string;
      referral_bonus_uses?: number;
    };

    if (!config.active || !config.starts_at || !config.ends_at) {
      return DEFAULT_REFERRAL_BONUS;
    }

    const now = new Date();
    if (now >= new Date(config.starts_at) && now <= new Date(config.ends_at)) {
      return config.referral_bonus_uses ?? DEFAULT_REFERRAL_BONUS;
    }
  } catch {
    // При ошибке — дефолтный бонус
  }

  return DEFAULT_REFERRAL_BONUS;
}
