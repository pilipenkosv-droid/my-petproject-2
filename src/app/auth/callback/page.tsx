/**
 * OAuth callback — клиентский обмен кода на сессию.
 *
 * Через Nginx-прокси серверный route крашился (502) из-за больших
 * Set-Cookie headers (Supabase JWT). Клиентский exchange обходит эту проблему:
 * cookies ставятся напрямую в браузере без прохода через Nginx response.
 */

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = params.get("next") ?? "/create";

    if (!code) {
      router.replace("/login?error=no_code");
      return;
    }

    const supabase = getSupabaseBrowser();

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error("[auth/callback] Exchange error:", error.message);
        router.replace("/login?error=auth_failed");
      } else {
        router.replace(next);
      }
    });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Авторизация...</p>
    </div>
  );
}
