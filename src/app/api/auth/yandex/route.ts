/**
 * GET /api/auth/yandex — инициация OAuth flow с Yandex ID.
 *
 * Генерирует HMAC-подписанный state, сохраняет в HttpOnly cookie,
 * редиректит пользователя на oauth.yandex.ru.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateOAuthState, buildYandexAuthUrl } from "@/lib/auth/yandex-oauth";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/create";
  const redirectUri = `${SITE_URL}/api/auth/yandex/callback`;

  const state = generateOAuthState(next);
  const authUrl = buildYandexAuthUrl(state, redirectUri);

  const response = NextResponse.redirect(authUrl);

  response.cookies.set("yandex_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300, // 5 минут
  });

  return response;
}
