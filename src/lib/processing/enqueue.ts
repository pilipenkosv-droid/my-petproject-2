/**
 * Постановка задач в очередь воркера (ADR-016, шаг 9 — теневой режим).
 *
 * Модуль не импортирует next/*.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FormattingRules } from "@/types/formatting-rules";

export interface ShadowJobInput {
  jobId: string;
  sourceDocumentId: string;
  sourceOriginalName?: string;
  workType?: string;
  rules: FormattingRules;
}

/**
 * Открывает задачу для захвата воркером: queued_at — признак «исходник в
 * Storage, списание проведено». Без него claim_next_job задачу не видит, иначе
 * воркер утащил бы строку, созданную createJob до сохранения файла.
 *
 * Колонки захвата сбрасываются: одна задача ставится в очередь дважды (разбор
 * методички, потом форматирование), а claim_next_job берёт только строки с
 * worker_id IS NULL — иначе второй этап навсегда остался бы в очереди.
 *
 * Статус и прогресс ставятся тем же UPDATE — одна запись вместо двух.
 */
export async function markJobQueued(jobId: string, message: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("jobs")
    .update({
      status: "pending",
      progress: 15,
      status_message: message,
      queued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      worker_id: null,
      worker_claimed_at: null,
      worker_heartbeat_at: null,
      attempts: 0,
    })
    .eq("id", jobId);

  if (error) {
    console.error("[enqueue] markJobQueued failed:", error);
    return false;
  }
  return true;
}

/** Id теневой задачи выводится из исходной. */
export function shadowJobId(jobId: string): string {
  return `${jobId}-shadow`;
}

/**
 * Теневая копия задачи: те же входные данные, но без владельца.
 *
 * Id детерминированный (`<jobId>-shadow`), а не nanoid: повторный вызов для той
 * же задачи упирается в первичный ключ и не плодит дублей, а в SQL связь с
 * оригиналом видна без join.
 *
 * user_id и session_id пустые — теневая задача не принадлежит пользователю,
 * не списывает использований (воркер видит shadow_of и не трогает списания)
 * и отфильтрована из отчётов по shadow_of IS NULL.
 *
 * Провал вставки не должен влиять на ответ пользователю: возвращаем false.
 */
export async function createShadowJob(input: ShadowJobInput): Promise<boolean> {
  const id = shadowJobId(input.jobId);

  try {
    const { error } = await getSupabaseAdmin().from("jobs").insert({
      id,
      status: "pending",
      progress: 0,
      status_message: "Теневая задача",
      user_id: null,
      session_id: null,
      shadow_of: input.jobId,
      source_document_id: input.sourceDocumentId,
      source_original_name: input.sourceOriginalName ?? null,
      work_type: input.workType ?? null,
      requirements_mode: "gost",
      rules: input.rules,
      // Теневая строка сразу готова к захвату: исходник уже в Storage.
      queued_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[enqueue] shadow job insert failed:", error);
      return false;
    }
    return true;
  } catch (insertError) {
    console.error("[enqueue] shadow job insert threw:", insertError);
    return false;
  }
}
