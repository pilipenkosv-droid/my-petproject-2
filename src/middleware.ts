/**
 * Next.js Middleware — обновляет Supabase Auth сессию на каждый запрос.
 * Не защищает роуты — защита на уровне page/API.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Middleware only runs on pages that need auth session refresh.
     * Excluded: landing (/), pricing, static assets, API routes, _next.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/|pricing|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$)(?!$).*)",
  ],
};
