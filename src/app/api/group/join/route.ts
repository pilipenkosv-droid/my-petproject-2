/**
 * GET /api/group/join?code=[code] — Перенаправление на лендинг группы
 * Ставит cookie dlx_grp, чтобы при регистрации привязать к группе
 */

import { NextRequest, NextResponse } from "next/server";
import { getGroupByCode } from "@/lib/group/utils";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${SITE_URL}/`);
  }

  const group = await getGroupByCode(code);
  if (!group || !group.is_active) {
    return NextResponse.redirect(`${SITE_URL}/`);
  }

  const response = NextResponse.redirect(
    `${SITE_URL}/g/${code}?utm_source=group&utm_medium=link&utm_campaign=${code}`
  );

  // Cookie на 7 дней — для привязки при регистрации
  response.cookies.set("dlx_grp", code, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
