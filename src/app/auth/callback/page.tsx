/**
 * OAuth callback — клиентский обмен кода на сессию.
 *
 * Через Nginx-прокси серверный route крашился (502) из-за больших
 * Set-Cookie headers (Supabase JWT). Клиентский exchange обходит эту проблему:
 * cookies ставятся напрямую в браузере без прохода через Nginx response.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const processed = useRef(false);
  const [status, setStatus] = useState("Авторизация...");
  const [debug, setDebug] = useState("");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = params.get("next") ?? "/create";

    // Диагностика: проверяем наличие code_verifier cookie
    const cookies = document.cookie.split(";").map((c) => c.trim().split("=")[0]);
    const codeVerifierCookie = cookies.find((c) => c.includes("code-verifier"));
    setDebug(`code: ${code?.slice(0, 8)}..., code_verifier cookie: ${codeVerifierCookie ?? "NOT FOUND"}, all cookies: [${cookies.join(", ")}]`);

    if (!code) {
      router.replace("/login?error=no_code");
      return;
    }

    const supabase = getSupabaseBrowser();

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ data, error }) => {
        if (error) {
          setStatus(`Ошибка: ${error.message}`);
          setDebug((prev) => `${prev}\n\nExchange error: ${JSON.stringify({ message: error.message, status: error.status, name: error.name })}`);
        } else {
          setStatus("Успешно! Перенаправление...");
          router.replace(next);
        }
      })
      .catch((err) => {
        setStatus(`Exception: ${err.message}`);
        setDebug((prev) => `${prev}\n\nException: ${err.message}`);
      });
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p className="text-muted-foreground">{status}</p>
      {debug && (
        <pre className="max-w-lg whitespace-pre-wrap break-all rounded bg-muted p-4 text-xs">
          {debug}
        </pre>
      )}
    </div>
  );
}
