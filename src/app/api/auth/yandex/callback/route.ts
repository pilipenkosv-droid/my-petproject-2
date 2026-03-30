/**
 * GET /api/auth/yandex/callback — обработка ответа от Yandex OAuth.
 *
 * Flow:
 * 1. Валидация state (CSRF)
 * 2. Обмен code на access_token
 * 3. Получение user info из Yandex API
 * 4. Создание/поиск пользователя в Supabase
 * 5. Генерация magic link + серверная верификация через verifyOtp
 * 6. Установка сессии через cookies и редирект
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { populateUserAttribution } from "@/lib/analytics/attribution";
import {
  validateOAuthState,
  exchangeYandexCode,
  getYandexUserInfo,
} from "@/lib/auth/yandex-oauth";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get("yandex_oauth_state")?.value;

  // 1. Валидация state
  if (!code || !state || !cookieState || state !== cookieState) {
    console.error("[yandex/callback] Invalid state or missing code");
    return redirectError("auth_failed");
  }

  const stateData = validateOAuthState(state);
  if (!stateData) {
    console.error("[yandex/callback] State validation failed (expired or tampered)");
    return redirectError("auth_failed");
  }

  const redirectUri = `${SITE_URL}/api/auth/yandex/callback`;

  try {
    // 2. Обмен code → access_token
    const accessToken = await exchangeYandexCode(code, redirectUri);

    // 3. Получение данных пользователя
    const yandexUser = await getYandexUserInfo(accessToken);

    if (!yandexUser.default_email) {
      console.error("[yandex/callback] No email from Yandex for user:", yandexUser.id);
      return redirectError("no_email");
    }

    const email = yandexUser.default_email;
    const fullName = yandexUser.display_name
      || yandexUser.real_name
      || [yandexUser.first_name, yandexUser.last_name].filter(Boolean).join(" ")
      || yandexUser.login;

    const admin = getSupabaseAdmin();

    // 4. Найти или создать пользователя
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        provider: "yandex",
        yandex_id: yandexUser.id,
        avatar_url: yandexUser.default_avatar_id
          ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200`
          : undefined,
      },
    });

    if (newUser?.user) {
      // Новый пользователь создан
    } else if (createError?.message?.includes("already been registered")) {
      // Пользователь уже существует — account linking, продолжаем
    } else if (createError) {
      console.error("[yandex/callback] Create user error:", createError.message);
      return redirectError("auth_failed");
    }

    // 5. Генерация magic link и серверная верификация
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[yandex/callback] Generate link error:", linkError?.message);
      return redirectError("auth_failed");
    }

    // Верификация токена на сервере — создаёт сессию и устанавливает cookies
    const supabase = await createSupabaseServer();
    const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyError || !sessionData?.user) {
      console.error("[yandex/callback] Verify OTP error:", verifyError?.message);
      return redirectError("auth_failed");
    }

    // 6. Attribution и реферальная привязка (как в /auth/callback)
    const sessionId = request.cookies.get("dlx_sid")?.value;
    const ymUid = request.cookies.get("_ym_uid")?.value;
    const userId = sessionData.user.id;

    if (sessionId) {
      populateUserAttribution(userId, sessionId, ymUid).catch((err) =>
        console.error("[yandex/callback] Attribution error:", err)
      );
    }

    const refCode = request.cookies.get("dlx_ref")?.value;
    if (refCode) {
      fetch(`${SITE_URL}/api/referral/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: refCode }),
      }).catch((err) =>
        console.error("[yandex/callback] Referral register error:", err)
      );
    }

    // Редирект на целевую страницу
    const response = NextResponse.redirect(`${SITE_URL}${stateData.next}`);
    response.cookies.delete("yandex_oauth_state");
    return response;
  } catch (err) {
    console.error("[yandex/callback] Exception:", err);
    return redirectError("auth_failed");
  }
}

function redirectError(error: string): NextResponse {
  const response = NextResponse.redirect(`${SITE_URL}/login?error=${error}`);
  response.cookies.delete("yandex_oauth_state");
  return response;
}
