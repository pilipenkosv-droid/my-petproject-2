"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Mail, Loader2 } from "lucide-react";

// Google "G" icon SVG
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

type AuthMode = "login" | "signup" | "forgotPassword";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const supabase = getSupabaseBrowser();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/create");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setMessage("Проверьте почту — мы отправили ссылку для подтверждения.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Произошла ошибка";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError("");
    const supabase = getSupabaseBrowser();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const supabase = getSupabaseBrowser();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) throw error;
      setMessage("Ссылка для сброса пароля отправлена на вашу почту.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Произошла ошибка";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 w-full max-w-md">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-on-surface-subtle hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        На главную
      </Link>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            <span className="gradient-text">Smart</span>
            <span className="text-foreground">Format</span>
          </CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Войдите в аккаунт"
              : mode === "signup"
              ? "Создайте аккаунт"
              : "Восстановление пароля"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "forgotPassword" ? (
            <>
              {/* Forgot Password form */}
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                {message && (
                  <p className="text-sm text-green-400">{message}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Сбросить пароль
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(""); setMessage(""); }}
                  className="text-primary hover:text-primary/80 underline"
                >
                  Вернуться ко входу
                </button>
              </p>
            </>
          ) : (
            <>
              {/* Google OAuth */}
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleAuth}
                disabled={loading}
              >
                <GoogleIcon className="mr-2 h-4 w-4" />
                Войти через Google
              </Button>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">или</span>
                <Separator className="flex-1" />
              </div>

              {/* Email/Password form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Пароль</Label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => { setMode("forgotPassword"); setError(""); setMessage(""); }}
                        className="text-xs text-primary hover:text-primary/80"
                      >
                        Забыли пароль?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Минимум 6 символов"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={loading}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                {message && (
                  <p className="text-sm text-green-400">{message}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {mode === "login" ? "Войти" : "Зарегистрироваться"}
                </Button>
              </form>

              {/* Toggle mode */}
              <p className="text-center text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>
                    Нет аккаунта?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
                      className="text-primary hover:text-primary/80 underline"
                    >
                      Зарегистрироваться
                    </button>
                  </>
                ) : (
                  <>
                    Уже есть аккаунт?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("login"); setError(""); setMessage(""); }}
                      className="text-primary hover:text-primary/80 underline"
                    >
                      Войти
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen relative flex items-center justify-center px-6 py-12">
      {/* Background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-64 h-64 bg-brand-2/20 rounded-full blur-[100px] animate-pulse-glow" />
        <div className="absolute bottom-40 left-20 w-80 h-80 bg-brand-3/15 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: "2s" }} />
      </div>

      <Suspense fallback={
        <div className="relative z-10 w-full max-w-md flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-1" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </main>
  );
}
