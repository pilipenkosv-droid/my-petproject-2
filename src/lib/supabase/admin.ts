/**
 * Supabase admin-клиент (service_role, обходит RLS).
 *
 * Отдельный модуль без импортов next/*: его тянут job-store, file-storage,
 * payment и rate-limiter, а они должны запускаться и вне Next — во внешнем
 * воркере на обычном Node (ADR-016).
 */

import { createClient } from "@supabase/supabase-js";

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
