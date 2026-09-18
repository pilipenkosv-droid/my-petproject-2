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
