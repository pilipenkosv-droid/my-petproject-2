/**
 * Supabase серверные клиенты
 *
 * getSupabaseAdmin() — service_role, обходит RLS. Живёт в ./admin (без next/*),
 * здесь только реэкспорт для существующих импортёров.
 * createSupabaseServer() — auth-aware, читает сессию из cookies. Для проверки авторизации.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export { getSupabaseAdmin, getSupabase } from "./admin";

// === Auth-aware server client (reads session from cookies) ===

export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll can fail in Server Components (read-only cookies)
            // This is expected — middleware handles cookie refresh
          }
        },
      },
    }
  );
}
