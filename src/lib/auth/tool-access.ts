/**
 * Tier-логика для AI-инструментов (rewrite/summarize/outline/ask-guidelines).
 * Единая точка истины: anon | free | pro | admin.
 *
 * Pro-tier получает квоту TOOL_USES_PER_MONTH в месяц (общий пул на 4 тулзы).
 * Lazy-reset: при истечении tool_uses_reset_at квота восстанавливается на лету.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getUserAccess } from "@/lib/payment/access";
import { TOOL_USES_PER_MONTH } from "@/lib/payment/config";

export type ToolTier = "anon" | "free" | "pro" | "admin";
export type ToolName = "rewrite" | "summarize" | "outline" | "ask-guidelines";

export interface ToolAccess {
  tier: ToolTier;
  canUseFullResult: boolean;
  toolUsesRemaining: number;
  shouldTruncate: boolean;
}

const PRO_ACCESS_TYPES = new Set([
  "subscription",
  "subscription_plus",
  "subscription_plus_trial",
]);

/**
 * Возвращает доступ пользователя к AI-тулзам.
 * Если userId === null → anon (всегда truncate, без квоты).
 */
export async function getToolAccess(userId: string | null): Promise<ToolAccess> {
  if (!userId) {
    return {
      tier: "anon",
      canUseFullResult: false,
      toolUsesRemaining: 0,
      shouldTruncate: true,
    };
  }

  const access = await getUserAccess(userId);

  if (access.accessType === "admin") {
    return {
      tier: "admin",
      canUseFullResult: true,
      toolUsesRemaining: Number.POSITIVE_INFINITY,
      shouldTruncate: false,
    };
  }

  if (PRO_ACCESS_TYPES.has(access.accessType)) {
    const remaining = await ensureQuotaForPro(userId);
    return {
      tier: "pro",
      canUseFullResult: true,
      toolUsesRemaining: remaining,
      shouldTruncate: false,
    };
  }

  // trial / one_time / none → free тир (для AI-тулзов truncate, своей квоты нет)
  return {
    tier: "free",
    canUseFullResult: false,
    toolUsesRemaining: 0,
    shouldTruncate: true,
  };
}

/**
 * Lazy-reset месячной квоты Pro: если tool_uses_reset_at истёк или не задан,
 * выставляем remaining = TOOL_USES_PER_MONTH и reset_at = now() + 30d.
 */
async function ensureQuotaForPro(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("user_access")
    .select("tool_uses_remaining, tool_uses_reset_at")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return 0;
  }

  const now = new Date();
  const resetAt = data.tool_uses_reset_at ? new Date(data.tool_uses_reset_at) : null;
  const expired = !resetAt || resetAt < now;

  if (expired) {
    const newReset = new Date();
    newReset.setDate(newReset.getDate() + 30);

    await supabase
      .from("user_access")
      .update({
        tool_uses_remaining: TOOL_USES_PER_MONTH,
        tool_uses_reset_at: newReset.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);

    return TOOL_USES_PER_MONTH;
  }

  return data.tool_uses_remaining ?? 0;
}

/**
 * Списывает 1 использование из квоты Pro.
 * Возвращает true при успехе, false если квота исчерпана.
 * Admin — no-op (всегда true).
 */
export async function consumeToolUse(userId: string, _tool: ToolName): Promise<boolean> {
  void _tool; // зарезервирован для будущей пер-тул аналитики

  const access = await getUserAccess(userId);
  if (access.accessType === "admin") {
    return true;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("decrement_tool_uses", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[consumeToolUse] RPC failed:", error.message);
    return false;
  }

  return (data as number) >= 0;
}
