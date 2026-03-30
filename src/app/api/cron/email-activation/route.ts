/**
 * GET /api/cron/email-activation — Активационное письмо
 * Юзеры, зарегистрированные 24-26ч назад с 0 обработками.
 * Schedule: ежедневно 10:00 UTC
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendLifecycleEmail, appendUnsubscribeFooter } from "@/lib/email/lifecycle";
import { activationNudgeEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const now = new Date();
  const from = new Date(now.getTime() - 26 * 60 * 60 * 1000);
  const to = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Находим юзеров, зарегистрированных 24-26ч назад
  const { data: users } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (!users?.users?.length) {
    return NextResponse.json({ sent: 0 });
  }

  const recentUsers = users.users.filter((u) => {
    const created = new Date(u.created_at);
    return created >= from && created <= to && u.email;
  });

  let sent = 0;

  for (const user of recentUsers.slice(0, 100)) {
    try {
      // Проверяем: есть ли у юзера хотя бы 1 обработка
      const { count } = await admin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if ((count ?? 0) > 0) continue;

      const html = appendUnsubscribeFooter(
        activationNudgeEmail(),
        user.id,
        "activation_24h"
      );

      const wasSent = await sendLifecycleEmail({
        userId: user.id,
        email: user.email!,
        emailType: "activation_24h",
        subject: "Загрузи первый документ за 2 минуты",
        html,
      });

      if (wasSent) sent++;

      // Задержка между отправками
      if (sent > 0) await sleep(50);
    } catch (err) {
      console.error(`[email-activation] Error for ${user.id}:`, err);
    }
  }

  return NextResponse.json({ sent, checked: recentUsers.length });
}

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  return cronSecret === expected || authHeader === `Bearer ${expected}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
