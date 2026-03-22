import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Привязывает анонимную сессию к зарегистрированному пользователю.
 * Вызывается из auth/callback после exchangeCodeForSession.
 *
 * 1. Читает first-touch данные из session_attributions
 * 2. Записывает атрибуцию в user_profiles (только если ещё не заполнена)
 * 3. Привязывает анонимные jobs к пользователю
 */
export async function populateUserAttribution(
  userId: string,
  sessionId: string,
  ymUid?: string
) {
  const admin = getSupabaseAdmin();

  // Читаем first-touch атрибуцию сессии
  const { data: attribution } = await admin
    .from("session_attributions")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  // Обновляем user_profiles (только если first_session_id ещё не заполнен)
  await admin
    .from("user_profiles")
    .update({
      first_session_id: sessionId,
      first_landing_page: attribution?.landing_page ?? null,
      first_referrer: attribution?.referrer ?? null,
      first_utm_source: attribution?.utm_source ?? null,
      first_utm_medium: attribution?.utm_medium ?? null,
      first_utm_campaign: attribution?.utm_campaign ?? null,
      yandex_client_id: ymUid ?? attribution?.yandex_client_id ?? null,
    })
    .eq("user_id", userId)
    .is("first_session_id", null);

  // Привязываем анонимные jobs к пользователю
  await admin
    .from("jobs")
    .update({ user_id: userId })
    .eq("session_id", sessionId)
    .is("user_id", null);
}
