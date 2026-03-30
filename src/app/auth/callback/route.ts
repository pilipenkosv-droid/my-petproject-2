/**
 * OAuth callback — обмен кода на сессию (серверный).
 *
 * SITE_URL используется вместо request.url origin, т.к. через Nginx-прокси
 * Vercel видит свой домен (ai-sformat.vercel.app), а не публичный (diplox.online).
 *
 * Nginx настроен с proxy_buffer_size 128k для больших Supabase JWT cookies.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { populateUserAttribution } from "@/lib/analytics/attribution";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/create";

  if (code) {
    try {
      const supabase = await createSupabaseServer();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        // Привязываем анонимную сессию к пользователю
        const sessionId = request.cookies.get("dlx_sid")?.value;
        const ymUid = request.cookies.get("_ym_uid")?.value;
        const { data: { user } } = await supabase.auth.getUser();
        if (sessionId && user) {
          populateUserAttribution(user.id, sessionId, ymUid).catch((err) =>
            console.error("[auth/callback] Attribution error:", err)
          );

          // Синхронизация avatar_url из identity data (Google передаёт picture)
          syncAvatarFromIdentity(user).catch((err) =>
            console.error("[auth/callback] Avatar sync error:", err)
          );

          // Реферальная привязка: если есть cookie dlx_ref — привязать к реферреру
          const refCode = request.cookies.get("dlx_ref")?.value;
          if (refCode) {
            fetch(`${SITE_URL}/api/referral/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: user.id, code: refCode }),
            }).catch((err) =>
              console.error("[auth/callback] Referral register error:", err)
            );
          }

          // Групповая привязка: если есть cookie dlx_grp — присоединить к группе
          const grpCode = request.cookies.get("dlx_grp")?.value;
          if (grpCode) {
            fetch(`${SITE_URL}/api/group/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: user.id, code: grpCode }),
            }).catch((err) =>
              console.error("[auth/callback] Group register error:", err)
            );
          }
        }

        return NextResponse.redirect(`${SITE_URL}${next}`);
      }

      console.error("[auth/callback] Exchange error:", error.message);
    } catch (err) {
      console.error("[auth/callback] Exception:", err);
    }
  }

  return NextResponse.redirect(`${SITE_URL}/login?error=auth_failed`);
}

/**
 * Синхронизирует avatar_url из identity data провайдера.
 * Google хранит аватарку в identity_data.picture или identity_data.avatar_url.
 */
async function syncAvatarFromIdentity(user: { id: string; user_metadata?: Record<string, unknown>; identities?: Array<{ identity_data?: Record<string, unknown>; provider?: string }> }) {
  // Если avatar_url уже есть — ничего не делаем
  if (user.user_metadata?.avatar_url || user.user_metadata?.picture) return;

  // Ищем аватарку в identity data
  const identities = user.identities || [];
  let avatarUrl: string | undefined;

  for (const identity of identities) {
    const data = identity.identity_data;
    if (!data) continue;
    avatarUrl = (data.avatar_url || data.picture) as string | undefined;
    if (avatarUrl) break;
  }

  if (!avatarUrl) return;

  const admin = getSupabaseAdmin();
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      avatar_url: avatarUrl,
    },
  });
}
