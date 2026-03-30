/**
 * GET /api/auth/yandex/callback — обработка ответа от Yandex OAuth.
 *
 * Flow:
 * 1. Валидация state (CSRF)
 * 2. Обмен code на access_token
 * 3. Получение user info из Yandex API
 * 4. Создание/поиск пользователя в Supabase
 * 5. Генерация magic link → редирект через стандартный /auth/callback
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
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
    const { data: existingUsers } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    // listUsers не фильтрует по email, используем getUserByEmail через workaround
    let userId: string | undefined;

    // Пробуем найти по email через generateLink (если пользователь существует — вернёт его)
    // Но сначала попробуем создать — если уже есть, получим ошибку
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
      userId = newUser.user.id;
    } else if (createError?.message?.includes("already been registered")) {
      // Пользователь уже существует — это нормально (account linking)
      // generateLink всё равно сработает для существующего email
    } else if (createError) {
      console.error("[yandex/callback] Create user error:", createError.message);
      return redirectError("auth_failed");
    }

    // 5. Генерация magic link для создания сессии
    const redirectTo = `${SITE_URL}/auth/callback?next=${encodeURIComponent(stateData.next)}`;

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[yandex/callback] Generate link error:", linkError?.message);
      return redirectError("auth_failed");
    }

    // 6. Redirect на magic link → Supabase верифицирует → /auth/callback
    const response = NextResponse.redirect(linkData.properties.action_link);

    // Удаляем state cookie
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
