/**
 * Анонимный триал — 1 бесплатная обработка документа без регистрации.
 * Отслеживается через httpOnly cookie.
 */

import { type ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { type NextResponse } from "next/server";

const TRIAL_COOKIE = "sf_trial_used";
const MAX_FREE_PROCESSINGS = 1;

/**
 * Сколько обработок уже использовано (из cookie)
 */
export function getTrialUsage(
  cookieStore: ReadonlyRequestCookies
): number {
  const val = cookieStore.get(TRIAL_COOKIE)?.value;
  return val ? parseInt(val, 10) || 0 : 0;
}

/**
 * Можно ли обработать документ анонимно
 */
export function canProcessAnonymously(
  cookieStore: ReadonlyRequestCookies
): boolean {
  return getTrialUsage(cookieStore) < MAX_FREE_PROCESSINGS;
}

/**
 * Пометить триал как использованный (ставит cookie в response)
 */
export function markTrialUsed(response: NextResponse): void {
  response.cookies.set(TRIAL_COOKIE, "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60, // 1 год
    path: "/",
  });
}

/**
 * Имя cookie для проверки на клиенте
 * (клиент не может читать httpOnly, но может проверить через API)
 */
export const TRIAL_COOKIE_NAME = TRIAL_COOKIE;
