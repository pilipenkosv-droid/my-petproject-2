/**
 * Этап обработки задачи — один источник правды для воркера.
 *
 * Строка `jobs` не хранит этап явно: он выводится из режима требований и
 * наличия разобранной методички. Модуль не импортирует next/*.
 */

import type { JobState } from "@/lib/storage/job-store";

export type JobStage = "gost" | "extract-rules" | "confirm-rules";

/**
 * `requirementsMode !== "upload"` — обычный ГОСТ.
 * Методичка загружена, но текста ещё нет — её надо разобрать.
 * Текст есть — правила уже подтверждены, документ пора форматировать.
 */
export function resolveJobStage(
  job: Pick<JobState, "requirementsMode" | "guidelinesText">
): JobStage {
  if (job.requirementsMode !== "upload") return "gost";
  if (!job.guidelinesText || job.guidelinesText.trim() === "") {
    return "extract-rules";
  }
  return "confirm-rules";
}
