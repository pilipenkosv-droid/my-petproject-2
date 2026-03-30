/**
 * GET /api/referral/click?code=XXX — Записать клик, поставить cookie, redirect
 *
 * Используем query parameter вместо [code] dynamic segment,
 * чтобы избежать лишней вложенности директорий.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReferrerByCode, recordReferralEvent } from "@/lib/referral/utils";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${SITE_URL}/`);
  }

  const referrer = await getReferrerByCode(code);
  if (!referrer) {
    return NextResponse.redirect(`${SITE_URL}/`);
  }

  // Записываем клик
  const sessionId = request.cookies.get("dlx_sid")?.value;
  await recordReferralEvent({
    referrerId: referrer.userId,
    code,
    eventType: "click",
    sessionId,
  });

  // Ставим cookie и редиректим
  const redirectUrl = `${SITE_URL}/?utm_source=referral&utm_medium=link&utm_campaign=${code}`;
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set("dlx_ref", code, {
    maxAge: 30 * 24 * 60 * 60, // 30 дней
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });

  return response;
}
