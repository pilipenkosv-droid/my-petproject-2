/**
 * Хелпер авторизации для API routes.
 * Проверяет сессию и триал для анонимных пользователей.
 */

import { createSupabaseServer } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { canProcessAnonymously } from "./trial";
import type { User } from "@supabase/supabase-js";

export type AuthResult =
  | { type: "authenticated"; userId: string; user: User }
  | { type: "anonymous"; canProcess: boolean }
  | { type: "blocked"; reason: string };

/**
 * Получить текущего пользователя из cookie-сессии (null если не авторизован)
 */
export async function getAuthUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/**
 * Проверить доступ к обработке документа.
 * Возвращает тип доступа + информацию для принятия решения.
 */
export async function checkProcessingAccess(): Promise<AuthResult> {
  const user = await getAuthUser();

  if (user) {
    return { type: "authenticated", userId: user.id, user };
  }

  // Анонимный пользователь — проверяем триал
  const cookieStore = await cookies();
  const canProcess = canProcessAnonymously(cookieStore);

  if (!canProcess) {
    return {
      type: "blocked",
      reason: "Бесплатная попытка использована. Зарегистрируйтесь для продолжения.",
    };
  }

  return { type: "anonymous", canProcess: true };
}
