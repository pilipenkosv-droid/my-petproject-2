/**
 * Bot provisioning for Pro subscribers.
 * Calls the Telegram bot API to auto-create a user and return a deep link.
 * Limited to the first 10 Pro subscribers (alpha).
 */

import { SupabaseClient } from "@supabase/supabase-js";

const BOT_API_URL = process.env.BOT_API_URL;
const BOT_ADMIN_API_KEY = process.env.BOT_ADMIN_API_KEY;
const BOT_ACCESS_LIMIT = 10;

interface ProvisionResult {
  success: boolean;
  deepLink: string;
  existing: boolean;
}

/**
 * Check if we can still grant bot access (under the limit).
 */
export async function canGrantBotAccess(
  supabase: SupabaseClient
): Promise<boolean> {
  const { count } = await supabase
    .from("user_access")
    .select("*", { count: "exact", head: true })
    .eq("bot_access_granted", true);
  return (count || 0) < BOT_ACCESS_LIMIT;
}

/**
 * Provision a user in the bot and return their deep link.
 * Returns null if the bot API is not configured or the call fails.
 */
export async function provisionBotUser(
  email: string,
  name: string
): Promise<ProvisionResult | null> {
  if (!BOT_API_URL || !BOT_ADMIN_API_KEY) {
    console.warn("Bot API not configured, skipping bot provisioning");
    return null;
  }

  try {
    const res = await fetch(`${BOT_API_URL}/api/provision-pro-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": BOT_ADMIN_API_KEY,
      },
      body: JSON.stringify({ name, email }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Bot provisioning failed (${res.status}): ${body}`);
      return null;
    }

    const data = await res.json();
    return {
      success: data.success,
      deepLink: data.deep_link,
      existing: data.existing || false,
    };
  } catch (error) {
    console.error("Bot provisioning error:", error);
    return null;
  }
}

/**
 * Store bot access grant in Supabase user_access.
 */
export async function storeBotAccess(
  supabase: SupabaseClient,
  userId: string,
  deepLink: string
): Promise<void> {
  await supabase
    .from("user_access")
    .update({
      bot_access_granted: true,
      bot_deep_link: deepLink,
    })
    .eq("user_id", userId);
}
