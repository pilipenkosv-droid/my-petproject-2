/**
 * Возврат списанного использования, если обработка документа провалилась.
 *
 * consumeUse() списывает использование ДО запуска пайплайна. Если пайплайн упал
 * (исключение, таймаут Vercel, зависшая задача), использование должно вернуться.
 *
 * Идемпотентность обеспечивается двумя колонками в таблице jobs
 * (supabase/migration-023-jobs-use-refund.sql):
 *   use_consumed_at — за задачу списали использование;
 *   use_refunded_at — использование уже вернули, повтор не сработает.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Отмечает, что за эту задачу списано использование.
 * Вызывается сразу после успешного consumeUse(). Без этой отметки refundUse()
 * ничего не вернёт — так падения ДО списания не превращаются в бесплатные использования.
 */
export async function markUseConsumed(jobId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("jobs")
    .update({ use_consumed_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) {
    console.error("[markUseConsumed] failed for job:", jobId, error.message);
  }
}

/** Атомарный инкремент remaining_uses с фоллбэком на read+update */
async function incrementRemainingUses(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("increment_remaining_uses", {
    p_user_id: userId,
  });

  if (!error) {
    // RPC возвращает -1, если записи user_access нет (например, админ — с него не списывали)
    return (data as number) >= 0;
  }

  console.error("[refundUse] RPC failed, using fallback:", error.message);

  const { data: row, error: readError } = await supabase
    .from("user_access")
    .select("remaining_uses")
    .eq("user_id", userId)
    .single();

  if (readError || !row) {
    console.error("[refundUse] no user_access row for user:", userId);
    return false;
  }

  const current = (row as { remaining_uses: number }).remaining_uses ?? 0;
  const { error: updateError } = await supabase
    .from("user_access")
    .update({
      remaining_uses: current + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) {
    console.error("[refundUse] fallback update failed:", updateError.message);
    return false;
  }

  return true;
}

/**
 * Возвращает пользователю одно использование, списанное за задачу jobId.
 *
 * Идемпотентна: второй вызов для той же задачи — no-op.
 * Анонимные задачи (userId пустой) возврата не требуют: у них списывается только
 * cookie-триал через markTrialUsed(), и она ставится лишь на успешном ответе.
 *
 * @returns true, если использование действительно вернули
 */
export async function refundUse(
  userId: string | null | undefined,
  jobId: string,
  reason: string
): Promise<boolean> {
  if (!userId || !jobId) {
    return false;
  }

  const supabase = getSupabaseAdmin();

  // Атомарная заявка: строка обновится, только если списание было и возврата ещё не было.
  const { data: claimed, error: claimError } = await supabase
    .from("jobs")
    .update({ use_refunded_at: new Date().toISOString() })
    .eq("id", jobId)
    .not("use_consumed_at", "is", null)
    .is("use_refunded_at", null)
    .select("id");

  if (claimError) {
    console.error("[refundUse] claim failed for job:", jobId, claimError.message);
    return false;
  }

  if (!claimed || (claimed as unknown[]).length === 0) {
    return false;
  }

  const restored = await incrementRemainingUses(userId);

  if (!restored) {
    // Снимаем отметку, чтобы возврат можно было повторить
    await supabase
      .from("jobs")
      .update({ use_refunded_at: null })
      .eq("id", jobId);
    return false;
  }

  console.log(
    `[refundUse] returned 1 use to user ${userId} for job ${jobId}: ${reason}`
  );
  return true;
}
