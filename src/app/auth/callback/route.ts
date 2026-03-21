/**
 * OAuth callback — обмен кода на сессию.
 * Вызывается после Google OAuth или подтверждения email.
 *
 * Используем NEXT_PUBLIC_SITE_URL вместо request.url origin,
 * т.к. через Nginx-прокси Vercel видит свой домен (ai-sformat.vercel.app),
 * а не публичный (diplox.online).
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/create";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${SITE_URL}${next}`);
    }

    console.error("[auth/callback] Error exchanging code:", error.message);
  }

  return NextResponse.redirect(`${SITE_URL}/login?error=auth_failed`);
}
