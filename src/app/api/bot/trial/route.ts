/**
 * POST /api/bot/trial — активация бесплатного 7-дневного trial Diplox Bot.
 * Требует авторизации. Провижинит бота сразу после активации.
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { activateBotTrial } from "@/lib/payment/access";
import {
  canGrantBotAccess,
  provisionBotUser,
  getUserProfile,
  storeBotAccess,
} from "@/lib/bot/provision";

export async function POST() {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Необходима авторизация" },
        { status: 401 }
      );
    }

    // Активируем trial в user_access
    const result = await activateBotTrial(user.id);

    if (!result.success) {
      if (result.reason === "already_has_access") {
        return NextResponse.json(
          { error: "У вас уже есть доступ к Diplox Bot" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Не удалось активировать trial" },
        { status: 500 }
      );
    }

    // Провижиним бота
    const admin = getSupabaseAdmin();
    let botDeepLink: string | null = null;

    const canGrant = await canGrantBotAccess(admin);
    if (canGrant) {
      const profile = await getUserProfile(admin, user.id);
      if (profile) {
        const provision = await provisionBotUser(profile.email, profile.name);
        if (provision?.success) {
          await storeBotAccess(admin, user.id, provision.deepLink);
          botDeepLink = provision.deepLink;
        }
      }
    }

    console.log("[bot/trial] activated for user:", user.id);

    return NextResponse.json({
      success: true,
      botDeepLink,
      trialDays: 7,
    });
  } catch (error) {
    console.error("[bot/trial] error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
