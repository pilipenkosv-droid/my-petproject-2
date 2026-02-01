/**
 * Управление доступом пользователя (проверка оплаты, списание использований)
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LAVA_CONFIG } from "./config";

export interface UserAccess {
  hasAccess: boolean;
  accessType: "trial" | "one_time" | "subscription" | "none";
  remainingUses: number;
  subscriptionActiveUntil: string | null;
}

/**
 * Проверяет, есть ли у пользователя доступ к обработке документа
 */
export async function getUserAccess(userId: string): Promise<UserAccess> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("user_access")
    .select("*")
    .eq("user_id", userId)
    .single();

  // Нет записи — новый пользователь, даём триал
  if (error || !data) {
    return {
      hasAccess: true,
      accessType: "trial",
      remainingUses: LAVA_CONFIG.freeTrialUses,
      subscriptionActiveUntil: null,
    };
  }

  // Подписка
  if (data.access_type === "subscription" && data.subscription_active_until) {
    const isActive = new Date(data.subscription_active_until) > new Date();
    return {
      hasAccess: isActive,
      accessType: isActive ? "subscription" : "none",
      remainingUses: isActive ? -1 : 0, // -1 = безлимит
      subscriptionActiveUntil: data.subscription_active_until,
    };
  }

  // Разовая покупка
  if (data.access_type === "one_time") {
    return {
      hasAccess: data.remaining_uses > 0,
      accessType: data.remaining_uses > 0 ? "one_time" : "none",
      remainingUses: data.remaining_uses,
      subscriptionActiveUntil: null,
    };
  }

  return {
    hasAccess: false,
    accessType: "none",
    remainingUses: 0,
    subscriptionActiveUntil: null,
  };
}

/**
 * Списывает одно использование (для разовых покупок и триала)
 */
export async function consumeUse(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const access = await getUserAccess(userId);

  // Подписка — не списываем
  if (access.accessType === "subscription") return true;

  // Триал — создаём запись и списываем
  if (access.accessType === "trial") {
    const { error } = await supabase.from("user_access").upsert({
      user_id: userId,
      access_type: "one_time",
      remaining_uses: LAVA_CONFIG.freeTrialUses - 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return !error;
  }

  // Разовая покупка — декрементим
  if (access.accessType === "one_time" && access.remainingUses > 0) {
    const { error } = await supabase.rpc("decrement_remaining_uses", {
      p_user_id: userId,
    });

    // Фоллбэк если RPC не создан
    if (error) {
      const { error: updateError } = await supabase
        .from("user_access")
        .update({
          remaining_uses: access.remainingUses - 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      return !updateError;
    }

    return true;
  }

  return false;
}

/**
 * Активирует доступ после успешной оплаты
 */
export async function activateAccess(
  userId: string,
  type: "one_time" | "subscription",
  lavaSubscriptionId?: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  if (type === "one_time") {
    // Добавляем использование
    const current = await getUserAccess(userId);
    const currentUses =
      current.accessType === "none" || current.accessType === "trial"
        ? 0
        : current.remainingUses;

    await supabase.from("user_access").upsert(
      {
        user_id: userId,
        access_type: "one_time",
        remaining_uses: (currentUses < 0 ? 0 : currentUses) + LAVA_CONFIG.offers.oneTime.uses,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } else {
    // Подписка на 30 дней
    const activeUntil = new Date();
    activeUntil.setDate(activeUntil.getDate() + 30);

    await supabase.from("user_access").upsert(
      {
        user_id: userId,
        access_type: "subscription",
        remaining_uses: 0,
        subscription_active_until: activeUntil.toISOString(),
        lava_subscription_id: lavaSubscriptionId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }
}
