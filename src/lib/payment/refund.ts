/**
 * Возврат списанного использования, если обработка документа провалилась.
 *
 * consumeUse() списывает использование ДО запуска пайплайна. Если пайплайн упал
 * (исключение, таймаут Vercel, зависшая задача), использование должно вернуться.
 *
 * Идемпотентность и атомарность обеспечивает RPC refund_job_use()
 * (supabase/migration-023-jobs-use-refund.sql): заявка на возврат в jobs
 * (use_consumed_at → use_refunded_at) и инкремент remaining_uses идут одной
 * транзакцией.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Отмечает, что за эту задачу списано использование.
 * Вызывается сразу после успешного consumeUse(). Без этой отметки refundUse()
 * ничего не вернёт — так падения ДО списания не превращаются в бесплатные использования.
 *
 * @returns true, если отметка проставлена. false — вызывающий обязан
 *          компенсировать списание через compensateConsume() и провалить задачу.
 */
export async function markUseConsumed(jobId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("jobs")
    .update({ use_consumed_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) {
    console.error("[markUseConsumed] failed for job:", jobId, error.message);
    return false;
  }

  return true;
}

/**
 * Компенсирует списание, которое не удалось привязать к задаче (markUseConsumed
 * упал). Обычный refundUse() тут бесполезен: без use_consumed_at он не опознает
 * списание. Не идемпотентна — вызывать ровно один раз, на провале markUseConsumed.
 */
export async function compensateConsume(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("increment_remaining_uses", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[compensateConsume] RPC failed for user:", userId, error.message);
    return false;
  }

  // RPC возвращает -1, если записи user_access нет (например, админ — с него не списывали)
  return (data as number) >= 0;
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

  const { data, error } = await supabase.rpc("refund_job_use", {
    p_job_id: jobId,
    p_user_id: userId,
  });

  if (error) {
    // Самая вероятная причина — migration-023 ещё не применена на этой базе.
    console.error(
      "[refundUse] RPC refund_job_use failed (миграция 023 применена?):",
      jobId,
      error.message
    );
    return false;
  }

  if (data !== true) {
    return false;
  }

  console.log(
    `[refundUse] returned 1 use to user ${userId} for job ${jobId}: ${reason}`
  );
  return true;
}
