/**
 * Управление доступом пользователя (проверка оплаты, списание использований)
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LAVA_CONFIG } from "./config";

/**
 * Whitelist админских email-адресов с бесконечным Pro доступом.
 * Эти аккаунты получают unlimited доступ без проверки оплаты.
 */
const ADMIN_EMAILS = [
  "pilipenkosv@gmail.com",
  "mary_shu@mail.ru",
];

export interface UserAccess {
  hasAccess: boolean;
  accessType: "trial" | "one_time" | "subscription" | "subscription_plus" | "admin" | "none";
  remainingUses: number;
  subscriptionActiveUntil: string | null;
  botDeepLink: string | null;
}

/**
 * Проверяет, является ли email админским (whitelist)
 */
async function isAdminUser(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("auth.users")
    .select("email")
    .eq("id", userId)
    .single();

  // Fallback: проверяем через auth.users напрямую
  if (!data) {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    if (authData?.user?.email) {
      return ADMIN_EMAILS.includes(authData.user.email.toLowerCase());
    }
    return false;
  }

  return ADMIN_EMAILS.includes(data.email?.toLowerCase() || "");
}

/**
 * Проверяет, есть ли у пользователя доступ к обработке документа
 */
export async function getUserAccess(userId: string): Promise<UserAccess> {
  const supabase = getSupabaseAdmin();

  // Проверяем, является ли пользователь админом (бесконечный доступ)
  const isAdmin = await isAdminUser(userId);
  if (isAdmin) {
    return {
      hasAccess: true,
      accessType: "admin",
      remainingUses: 999999,
      subscriptionActiveUntil: "2099-12-31T23:59:59Z",
      botDeepLink: null,
    };
  }

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
      botDeepLink: null,
    };
  }

  // Подписка (Pro или Pro Plus)
  if ((data.access_type === "subscription" || data.access_type === "subscription_plus") && data.subscription_active_until) {
    const isActive = new Date(data.subscription_active_until) > new Date();
    return {
      hasAccess: isActive && data.remaining_uses > 0,
      accessType: isActive ? data.access_type : "none",
      remainingUses: isActive ? data.remaining_uses : 0,
      subscriptionActiveUntil: data.subscription_active_until,
      botDeepLink: data.access_type === "subscription_plus" ? (data.bot_deep_link || null) : null,
    };
  }

  // Разовая покупка
  if (data.access_type === "one_time") {
    return {
      hasAccess: data.remaining_uses > 0,
      accessType: data.remaining_uses > 0 ? "one_time" : "none",
      remainingUses: data.remaining_uses,
      subscriptionActiveUntil: null,
      botDeepLink: data.bot_deep_link || null,
    };
  }

  return {
    hasAccess: false,
    accessType: "none",
    remainingUses: 0,
    subscriptionActiveUntil: null,
    botDeepLink: data.bot_deep_link || null,
  };
}

/**
 * Списывает одно использование.
 * Использует атомарный SQL-декремент (RPC) для предотвращения race conditions.
 */
export async function consumeUse(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const access = await getUserAccess(userId);

  // Админ — не списываем использования
  if (access.accessType === "admin") {
    return true;
  }

  // Триал — создаём запись и списываем (нет записи в БД, нельзя декрементить)
  if (access.accessType === "trial") {
    const { error } = await supabase.from("user_access").upsert({
      user_id: userId,
      access_type: "one_time",
      remaining_uses: LAVA_CONFIG.freeTrialUses - 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) {
      console.error("[consumeUse] trial upsert failed:", error.message);
    }
    return !error;
  }

  // Подписка, разовая покупка — атомарный декремент через RPC
  if (access.remainingUses > 0) {
    const { data, error } = await supabase.rpc("decrement_remaining_uses", {
      p_user_id: userId,
    });

    if (error) {
      // Фоллбэк: прямой update с условием remaining_uses > 0
      console.error("[consumeUse] RPC failed, using fallback:", error.message);
      const { data: rows, error: updateError } = await supabase
        .from("user_access")
        .update({
          remaining_uses: access.remainingUses - 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .gt("remaining_uses", 0)
        .select("remaining_uses");

      if (updateError) {
        console.error("[consumeUse] fallback update failed:", updateError.message);
        return false;
      }
      return (rows?.length ?? 0) > 0;
    }

    // RPC возвращает -1 если нечего списывать
    const newRemaining = data as number;
    if (newRemaining < 0) {
      console.error("[consumeUse] no uses to consume for user:", userId);
      return false;
    }

    return true;
  }

  console.error("[consumeUse] no remaining uses for user:", userId);
  return false;
}

/**
 * Активирует доступ после успешной оплаты
 */
export async function activateAccess(
  userId: string,
  type: "one_time" | "subscription" | "subscription_plus",
  lavaSubscriptionId?: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  if (type === "one_time") {
    // Добавляем использование
    const current = await getUserAccess(userId);
    const currentUses =
      current.accessType === "none" || current.accessType === "trial" || current.accessType === "admin"
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
    // Подписка на 30 дней (Pro или Pro Plus)
    const activeUntil = new Date();
    activeUntil.setDate(activeUntil.getDate() + 30);
    const uses = type === "subscription_plus"
      ? LAVA_CONFIG.offers.subscriptionPlus.uses
      : LAVA_CONFIG.offers.subscription.uses;

    await supabase.from("user_access").upsert(
      {
        user_id: userId,
        access_type: type,
        remaining_uses: uses,
        subscription_active_until: activeUntil.toISOString(),
        lava_subscription_id: lavaSubscriptionId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }
}

/**
 * Продлевает подписку на указанное кол-во месяцев (для реферальных наград).
 * Если активная подписка есть — добавляет к существующей дате.
 * Если нет — создаёт новую subscription.
 */
export async function extendSubscription(
  userId: string,
  months: number
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const access = await getUserAccess(userId);

  const daysToAdd = months * 30;

  // Определяем базовую дату: продлеваем от текущего истечения или от сейчас
  let baseDate: Date;
  if (
    (access.accessType === "subscription" || access.accessType === "subscription_plus") &&
    access.subscriptionActiveUntil
  ) {
    const currentExpiry = new Date(access.subscriptionActiveUntil);
    baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
  } else {
    baseDate = new Date();
  }

  const newExpiry = new Date(baseDate);
  newExpiry.setDate(newExpiry.getDate() + daysToAdd);

  await supabase.from("user_access").upsert(
    {
      user_id: userId,
      access_type: access.accessType === "subscription_plus" ? "subscription_plus" : "subscription",
      remaining_uses:
        access.accessType === "subscription" || access.accessType === "subscription_plus"
          ? Math.max(access.remainingUses, LAVA_CONFIG.offers.subscription.uses)
          : LAVA_CONFIG.offers.subscription.uses,
      subscription_active_until: newExpiry.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}
