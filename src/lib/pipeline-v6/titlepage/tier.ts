// Решалка тира рендеринга титульника: на основе userWorkTypeHint (из UI) и
// извлечённых LLM-полей выбираем один из трёх вариантов.
//
//   gost    — полный ГОСТ-шаблон (министерство/кафедра/научрук/плейсхолдеры)
//   minimal — лаконичный титул (title+author+city+year) без ВУЗ-блока.
//             Используется только как fallback для стандартных работ,
//             когда данных маловато, но юзер не выбирал «Другое».
//   skip    — не рендерим свой титульник, raw-copy оригинала.
//             Для нетипичных работ (отчёт/иное, UI hint «Другое») — чтобы
//             не «причёсывать» то, что не укладывается в шаблон.
//
// Правила:
//   1. Если UI hint = "иное" → skip (юзер явно сказал «не трогай»).
//   2. Если workType ∈ {отчёт, иное} → skip.
//   3. Если coreFields < 2 → skip (LLM провалился, доверия нет).
//   4. Иначе → gost.

import { countCoreFields, type TitlePageFields } from "./schema";

export type TitleTier = "gost" | "minimal" | "skip";

export interface TierDecisionInput {
  fields: TitlePageFields;
  userWorkTypeHint?: string | null;
}

export function decideTitleTier({ fields, userWorkTypeHint }: TierDecisionInput): TitleTier {
  if (userWorkTypeHint === "иное") return "skip";

  const wt = fields.workType;
  if (wt === "отчёт" || wt === "иное") return "skip";

  const core = countCoreFields(fields);
  if (core < 2) return "skip";

  return "gost";
}
