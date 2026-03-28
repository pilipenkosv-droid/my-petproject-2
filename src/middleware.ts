/**
 * Next.js Middleware:
 * 1. Обновляет Supabase Auth сессию на каждый запрос
 * 2. Ставит session cookie dlx_sid для серверного трекинга пользовательского пути
 *
 * Не защищает роуты — защита на уровне page/API.
 */

import { createServerClient } from "@supabase/ssr";
import { nanoid } from "nanoid";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "dlx_sid";
const SESSION_MAX_AGE = 365 * 24 * 60 * 60; // 1 год

export async function middleware(request: NextRequest) {
  // SEO: noindex для .vercel.app реализован через vercel.json headers
  // Redirect из middleware убран — Nginx проксирует с Host: vercel.app,
  // что создавало redirect loop (vercel→diplox→nginx→vercel→301→...)

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Обновляем сессию (refresh token если нужно)
  await supabase.auth.getUser();

  // Session cookie для трекинга пути (ставим если нет)
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    supabaseResponse.cookies.set(SESSION_COOKIE, nanoid(21), {
      maxAge: SESSION_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false, // Нужен доступ из клиентского JS
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Все страницы, кроме статических ресурсов и API routes.
     * Включает / и /pricing (нужны для session cookie).
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/admin/:path*",
  ],
};
