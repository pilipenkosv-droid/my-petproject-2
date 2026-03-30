/**
 * GET /api/referral/stats — Статистика реферальной воронки пользователя
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { getReferralStats, getOrCreateReferralLink } from "@/lib/referral/utils";
import { SITE_URL } from "@/lib/config/site";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [stats, link] = await Promise.all([
    getReferralStats(user.id),
    getOrCreateReferralLink(user.id),
  ]);

  return NextResponse.json({
    ...stats,
    code: link.code,
    referralUrl: `${SITE_URL}/api/referral/click?code=${link.code}`,
  });
}
