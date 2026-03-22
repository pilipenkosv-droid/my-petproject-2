/**
 * OAuth callback — обмен кода на сессию (серверный).
 *
 * SITE_URL используется вместо request.url origin, т.к. через Nginx-прокси
 * Vercel видит свой домен (ai-sformat.vercel.app), а не публичный (diplox.online).
 *
 * Nginx настроен с proxy_buffer_size 128k для больших Supabase JWT cookies.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
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
