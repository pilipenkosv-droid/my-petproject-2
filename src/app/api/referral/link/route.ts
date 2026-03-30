/**
 * GET /api/referral/link — Получить или создать реферальный код пользователя
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { getOrCreateReferralLink } from "@/lib/referral/utils";
import { SITE_URL } from "@/lib/config/site";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await getOrCreateReferralLink(user.id);

  return NextResponse.json({
    code,
    url: `${SITE_URL}/api/referral/click/${code}`,
  });
}
