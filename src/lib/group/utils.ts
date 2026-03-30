/**
 * Серверная логика групповых ссылок Diplox
 * Механика "Поделись с одногруппниками" — отдельная от реферальной системы
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { nanoid } from "nanoid";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

export function generateGroupCode(): string {
  return nanoid(8);
}

/**
 * Возвращает активную групповую ссылку пользователя или создаёт новую
 */
export async function getOrCreateGroupLink(
  userId: string,
  expiresAt?: string
): Promise<{ code: string; memberCount: number }> {
  const supabase = getSupabaseAdmin();

  // Ищем существующую активную ссылку
  const { data: existing } = await supabase
    .from("group_links")
    .select("code")
    .eq("creator_id", userId)
    .eq("is_active", true)
    .single();

  if (existing) {
    const { count } = await supabase
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_code", existing.code);

    return { code: existing.code, memberCount: count ?? 0 };
  }

  const code = generateGroupCode();

  const { error } = await supabase
    .from("group_links")
    .insert({
      code,
      creator_id: userId,
      expires_at: expiresAt || null,
    });

  if (error) {
    // Race condition — читаем повторно
    const { data: fallback } = await supabase
      .from("group_links")
      .select("code")
      .eq("creator_id", userId)
      .eq("is_active", true)
      .single();

    if (fallback) {
      return { code: fallback.code, memberCount: 0 };
    }

    throw new Error(`Failed to create group link: ${error.message}`);
  }

  return { code, memberCount: 0 };
}

/**
 * Получает информацию о групповой ссылке по коду
 */
export async function getGroupByCode(code: string) {
  const supabase = getSupabaseAdmin();

  const { data: link } = await supabase
    .from("group_links")
    .select("id, code, creator_id, label, created_at, expires_at, is_active")
    .eq("code", code)
    .single();

  if (!link) return null;

  const { count } = await supabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_code", code);

  return { ...link, memberCount: count ?? 0 };
}

/**
 * Присоединяет пользователя к группе и начисляет бонусы
 */
export async function joinGroup(
  groupCode: string,
  userId: string
): Promise<{ ok: boolean; alreadyMember: boolean }> {
  const supabase = getSupabaseAdmin();

  const link = await getGroupByCode(groupCode);
  if (!link || !link.is_active) {
    return { ok: false, alreadyMember: false };
  }

  // Проверка: нельзя присоединиться к своей группе
  if (link.creator_id === userId) {
    return { ok: false, alreadyMember: false };
  }

  // Проверка срока действия
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { ok: false, alreadyMember: false };
  }

  // Вставка — UNIQUE constraint предотвратит дубли
  const { error } = await supabase
    .from("group_members")
    .insert({
      group_code: groupCode,
      user_id: userId,
      bonus_granted: true,
    });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, alreadyMember: true };
    }
    throw error;
  }

  // Начисляем +1 обработку присоединившемуся
  await addBonusUses(userId, 1);

  // Начисляем +1 обработку создателю
  await addBonusUses(link.creator_id, 1);

  return { ok: true, alreadyMember: false };
}

/**
 * Начисляет бонусные обработки пользователю.
 * Если нет записи user_access — создаёт с типом one_time.
 */
async function addBonusUses(userId: string, count: number): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: current } = await supabase
    .from("user_access")
    .select("remaining_uses")
    .eq("user_id", userId)
    .single();

  const currentUses = current?.remaining_uses ?? 0;

  await supabase.from("user_access").upsert(
    {
      user_id: userId,
      access_type: "one_time",
      remaining_uses: (currentUses < 0 ? 0 : currentUses) + count,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

/**
 * Возвращает URL групповой ссылки
 */
export function getGroupUrl(code: string): string {
  return `${SITE_URL}/api/group/join?code=${code}`;
}
