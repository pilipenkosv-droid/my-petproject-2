// Zod schema для полей титульного листа. Используется:
//   1) для валидации JSON-ответа LLM (llm-extractor.ts);
//   2) как типизированный контракт при рендере (template-renderer.ts).

import { z } from "zod";

export const AuthorSchema = z.object({
  name: z.string().nullable(),
  group: z.string().nullable(),
  course: z.string().nullable(),
});

export const SupervisorSchema = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
  degree: z.string().nullable(),
});

export const ReviewerSchema = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
});

export const WORK_TYPES = [
  "диплом",
  "курсовая",
  "реферат",
  "отчёт",
  "вкр",
  "магистерская",
  "бакалаврская",
  "иное",
] as const;

export const TitlePageFieldsSchema = z.object({
  university: z.string().nullable(),
  faculty: z.string().nullable(),
  department: z.string().nullable(),
  workType: z.enum(WORK_TYPES).nullable(),
  title: z.string().nullable(),
  discipline: z.string().nullable(),
  speciality: z.string().nullable(),
  author: AuthorSchema.nullable(),
  supervisor: SupervisorSchema.nullable(),
  reviewer: ReviewerSchema.nullable(),
  city: z.string().nullable(),
  year: z.number().int().min(1990).max(2100).nullable(),
});

export type TitlePageFields = z.infer<typeof TitlePageFieldsSchema>;

/** Счётчик non-null среди ключевых полей. Используется для fallback-решения. */
export function countCoreFields(f: TitlePageFields): number {
  let n = 0;
  if (f.university) n++;
  if (f.title) n++;
  if (f.author?.name) n++;
  if (f.year) n++;
  return n;
}
