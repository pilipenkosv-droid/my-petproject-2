export interface WorkType {
  slug: string;
  label: string;
  shortLabel: string;
}

export const WORK_TYPES: readonly WorkType[] = [
  { slug: "diplom", label: "Дипломная работа", shortLabel: "Диплом" },
  { slug: "kursovaya", label: "Курсовая работа", shortLabel: "Курсовая" },
  { slug: "vkr", label: "ВКР (бакалавр)", shortLabel: "ВКР" },
  { slug: "magisterskaya", label: "Магистерская диссертация", shortLabel: "Магистерская" },
  { slug: "referat", label: "Реферат", shortLabel: "Реферат" },
  { slug: "esse", label: "Эссе", shortLabel: "Эссе" },
  { slug: "otchet-po-praktike", label: "Отчёт по практике", shortLabel: "Отчёт" },
  { slug: "other", label: "Другой тип работы", shortLabel: "Другое" },
] as const;

export type WorkTypeSlug = (typeof WORK_TYPES)[number]["slug"];

export type RequirementsMode = "upload" | "gost";

export function getWorkTypeBySlug(slug: string | null): WorkType | undefined {
  if (!slug) return undefined;
  return WORK_TYPES.find((wt) => wt.slug === slug);
}
