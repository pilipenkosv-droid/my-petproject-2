/**
 * Prompt for the residue layer.
 *
 * The model sees only the lines T0 could not prove anything about, stripped to
 * the facts that decide a structural role: the first 160 characters, whether
 * the line is bold/capsed/centred, how far its size sits from the body, what
 * came before it and whether a blank line follows. Nothing here asks it to
 * rewrite or judge the content of a student's paper.
 */

import { adaptSchema } from "@/lib/pipeline-v6/schema/adapter";
import { roleBatchSchema } from "./schema";

/** One line as the model sees it. `i` is the position inside this batch. */
export interface CandidateView {
  i: number;
  text: string;
  bold: boolean;
  capsRatio: number;
  centered: boolean;
  /** Run size minus the modal body size, in half-points. */
  sizeDelta: number;
  prevRole: string;
  nextIsEmpty: boolean;
  startsNumbered: boolean;
}

export const SYSTEM_PROMPT = [
  "Ты размечаешь структуру русскоязычной студенческой работы (диплом, курсовая, реферат).",
  "На вход — только те строки, которые не удалось определить по разметке файла.",
  "Для каждой строки укажи её структурную роль и уверенность от 0 до 1.",
  "",
  "РОЛИ: heading_L1, heading_L2, heading_L3, body, list_item, figure_caption,",
  "table_caption, bibliography_item, appendix_heading, title_page, toc, unknown.",
  "",
  "ПРАВИЛА:",
  "1. Подписи «Таблица 3 — Название», «Рисунок 2 — Схема» — это table_caption и",
  "   figure_caption, а НЕ заголовки, даже если они жирные и по центру.",
  "2. Жирное или заглавное предложение с точкой в конце и подлежащим-сказуемым —",
  "   это body. Заголовок обычно короткий и без завершающей точки.",
  "3. Строка списка литературы («Иванов И. И. Название. — М.: Наука, 2019. — 240 с.»)",
  "   — bibliography_item, а не заголовок, даже с номером в начале.",
  "4. «ПРИЛОЖЕНИЕ А» и подобное — appendix_heading.",
  "5. Строки шапки титульного листа (министерство, кафедра, город, год, ФИО студента",
  "   и руководителя) — title_page.",
  "6. Строка вида «1.2 Название раздела ......... 14» — toc.",
  "7. Уровень заголовка бери по нумерации: «2 Название» — L1, «2.1» — L2, «2.1.3» — L3.",
  "8. Если не уверен — ставь unknown с низкой уверенностью. Угадывать нельзя:",
  "   ошибочный заголовок ломает документ сильнее, чем пропущенный.",
  "",
  "Отвечай ТОЛЬКО валидным JSON по схеме, без markdown-обёрток и комментариев.",
].join("\n");

const SCHEMA_JSON = JSON.stringify(
  adaptSchema(roleBatchSchema, "RoleBatch", "gemini").schema,
);

export function buildUserPrompt(views: CandidateView[]): string {
  return [
    "Схема ответа (JSON Schema):",
    SCHEMA_JSON,
    "",
    `Строки (${views.length} шт.), поле i — индекс строки в этой пачке:`,
    views.map((v) => JSON.stringify(v)).join("\n"),
    "",
    "Верни объект {\"assignments\": [...]} — по одному элементу на каждый индекс i.",
    "Поле text в ответе не нужно.",
  ].join("\n");
}
