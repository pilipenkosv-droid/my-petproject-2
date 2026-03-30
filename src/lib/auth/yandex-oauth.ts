/**
 * Yandex OAuth 2.0 — хелперы для кастомной авторизации.
 *
 * Supabase не имеет встроенного провайдера Yandex,
 * поэтому OAuth flow реализован вручную.
 */

import { createHmac } from "crypto";

const YANDEX_AUTH_URL = "https://oauth.yandex.ru/authorize";
const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
const YANDEX_USER_INFO_URL = "https://login.yandex.ru/info?format=json";

const STATE_TTL_MS = 5 * 60 * 1000; // 5 минут

export interface YandexUserInfo {
  id: string;
  login: string;
  default_email?: string;
  display_name?: string;
  real_name?: string;
  first_name?: string;
  last_name?: string;
  default_avatar_id?: string;
}

function getSecret(): string {
  const secret = process.env.YANDEX_CLIENT_SECRET;
  if (!secret) throw new Error("Missing YANDEX_CLIENT_SECRET");
  return secret;
}

function getClientId(): string {
  const id = process.env.YANDEX_CLIENT_ID;
  if (!id) throw new Error("Missing YANDEX_CLIENT_ID");
  return id;
}

// --- State (CSRF protection) ---

function hmacSign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function generateOAuthState(next: string): string {
  const payload = Buffer.from(JSON.stringify({ ts: Date.now(), next })).toString("base64url");
  return `${payload}.${hmacSign(payload)}`;
}

export function validateOAuthState(state: string): { next: string } | null {
  const dotIdx = state.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);

  if (hmacSign(payload) !== sig) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - data.ts > STATE_TTL_MS) return null;
    return { next: data.next || "/create" };
  } catch {
    return null;
  }
}

// --- OAuth URLs & Exchange ---

export function buildYandexAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: redirectUri,
    scope: "login:email login:info login:avatar",
    state,
  });
  return `${YANDEX_AUTH_URL}?${params}`;
}

export async function exchangeYandexCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: getClientId(),
      client_secret: getSecret(),
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yandex token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

export async function getYandexUserInfo(accessToken: string): Promise<YandexUserInfo> {
  const res = await fetch(YANDEX_USER_INFO_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Yandex user info failed: ${res.status}`);
  }

  return res.json();
}
