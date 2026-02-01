/**
 * OAuth callback — обмен кода на сессию.
 * Вызывается после Google OAuth или подтверждения email.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/create";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("[auth/callback] Error exchanging code:", error.message);
  }

  // Ошибка — редирект на логин
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
