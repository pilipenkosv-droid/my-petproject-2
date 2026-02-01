/**
 * Supabase серверные клиенты
 *
 * getSupabaseAdmin() — service_role, обходит RLS. Для API routes и фоновых задач.
 * createSupabaseServer() — auth-aware, читает сессию из cookies. Для проверки авторизации.
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// === Admin client (service_role, bypasses RLS) ===

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _adminClient = createClient<any>(url, key, {
    auth: { persistSession: false },
  });

  return _adminClient;
}

/** @deprecated Use getSupabaseAdmin() instead */
export const getSupabase = getSupabaseAdmin;

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
