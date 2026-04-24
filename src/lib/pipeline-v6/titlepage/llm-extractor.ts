// LLM-экстрактор полей титульного листа.
// Берём первые ~3000 символов markdown (туда гарантированно влезает титул),
// просим Gemini 2.5 Flash извлечь поля в JSON, валидируем через Zod.

import { callAI } from "../../ai/gateway";
import { TitlePageFieldsSchema, type TitlePageFields } from "./schema";

const SYSTEM_PROMPT = [
  "Ты извлекаешь поля титульного листа из русскоязычного учебного документа (диплом, курсовая, реферат, отчёт).",
  "",
  "ПРАВИЛА:",
  "1. Отвечай ТОЛЬКО валидным JSON по предоставленной схеме, без markdown-обёрток.",
  "2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО придумывать данные. Если поле не найдено в тексте дословно — ставь null.",
  "3. ФИО нормализуй к формату «Фамилия И. О.» (пробел после точек).",
  "4. workType выбирай из: диплом, курсовая, реферат, отчёт, вкр, магистерская, бакалаврская, иное.",
  "5. year — целое число (например 2026).",
  "6. Если объект (author/supervisor/reviewer) полностью пустой — ставь null на сам объект.",
].join("\n");

const SCHEMA_DESCRIPTION = `{
  "university": string | null,
  "faculty": string | null,
  "department": string | null,
  "workType": "диплом"|"курсовая"|"реферат"|"отчёт"|"вкр"|"магистерская"|"бакалаврская"|"иное" | null,
  "title": string | null,
  "discipline": string | null,
  "speciality": string | null,
  "author": { "name": string|null, "group": string|null, "course": string|null } | null,
  "supervisor": { "name": string|null, "role": string|null, "degree": string|null } | null,
  "reviewer": { "name": string|null, "role": string|null } | null,
  "city": string | null,
  "year": number | null
}`;

export interface ExtractResult {
  fields: TitlePageFields;
  modelId: string;
  tokensUsed?: number;
}

export async function extractTitlePageFields(
  markdown: string,
  opts?: { maxSourceChars?: number },
): Promise<ExtractResult> {
  const maxChars = opts?.maxSourceChars ?? 3000;
  const source = markdown.slice(0, maxChars);

  // Regex fallback first — zero-cost, deterministic, covers structured
  // titlepages (including our sanitised bench corpus which has a well-known
  // layout). LLM is invoked only if regex returns fewer than 3 core fields.
  const regexFields = regexExtract(source);
  const regexCore = countCoreFields(regexFields);
  if (regexCore >= 4) {
    return { fields: regexFields, modelId: "regex-fallback" };
  }

  try {
    const userPrompt = [
      "Схема ответа:",
      SCHEMA_DESCRIPTION,
      "",
      "Текст первых страниц документа:",
      "```",
      source,
      "```",
      "",
      "Верни JSON по схеме. Не придумывай данные — чего нет в тексте, то null.",
    ].join("\n");

    const response = await callAI({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0,
      maxTokens: 4096,
    });
    const fields = TitlePageFieldsSchema.parse(response.json);
    // If LLM returned fewer useful fields than regex — prefer regex.
    const llmCore = countCoreFields(fields);
    if (llmCore < regexCore) return { fields: regexFields, modelId: "regex-fallback" };
    return { fields, modelId: response.modelId };
  } catch (err) {
    // LLM unavailable (quota / offline / API down) — return whatever regex
    // could extract. Keeps pipeline deterministic in bench / dev mode.
    if (regexCore >= 2) return { fields: regexFields, modelId: "regex-fallback" };
    throw err;
  }
}

function countCoreFields(f: TitlePageFields): number {
  let n = 0;
  if (f.university) n++;
  if (f.title) n++;
  if (f.workType) n++;
  if (f.author?.name) n++;
  if (f.year) n++;
  if (f.city) n++;
  return n;
}

const WORK_TYPES: Record<string, TitlePageFields["workType"]> = {
  "курсовая": "курсовая",
  "курсовая работа": "курсовая",
  "дипломная": "диплом",
  "дипломная работа": "диплом",
  "диплом": "диплом",
  "реферат": "реферат",
  "отчёт": "отчёт",
  "отчет": "отчёт",
  "вкр": "вкр",
  "выпускная квалификационная работа": "вкр",
  "магистерская": "магистерская",
  "магистерская диссертация": "магистерская",
  "бакалаврская": "бакалаврская",
  "бакалаврская работа": "бакалаврская",
};

function regexExtract(md: string): TitlePageFields {
  const text = md
    .replace(/[\*_`]+/g, "")
    .replace(/\\([.,:;!?])/g, "$1")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: TitlePageFields = {
    university: null,
    faculty: null,
    department: null,
    workType: null,
    title: null,
    discipline: null,
    speciality: null,
    author: null,
    supervisor: null,
    reviewer: null,
    city: null,
    year: null,
  };

  // University — first line with "университет"/"институт"/"учебное заведение"/
  // uppercase "УНИВЕРСИТЕТ". Take the whole line.
  for (const line of text.slice(0, 15)) {
    if (/университет|институт|академи[яи]|учебное заведение/i.test(line)) {
      result.university = line.slice(0, 200);
      break;
    }
  }

  // Work type on its own line, uppercase or title case.
  for (const line of text.slice(0, 25)) {
    const low = line.toLowerCase().trim();
    if (WORK_TYPES[low]) { result.workType = WORK_TYPES[low]; break; }
    for (const key of Object.keys(WORK_TYPES)) {
      if (low === key || low.startsWith(key + " ") || low.endsWith(" " + key)) {
        result.workType = WORK_TYPES[key];
        break;
      }
    }
    if (result.workType) break;
  }

  // Title — line after "на тему:" or line wrapped in « »
  for (let i = 0; i < text.length - 1; i++) {
    if (/^на\s+тему[:\s]/i.test(text[i])) {
      let t = text[i].replace(/^на\s+тему[:\s]*/i, "").trim();
      if (!t) t = text[i + 1];
      result.title = t.replace(/^«|»$/g, "").trim().slice(0, 250);
      break;
    }
  }
  if (!result.title) {
    for (const line of text.slice(0, 30)) {
      const m = /^«([^»]{5,200})»$/.exec(line);
      if (m) { result.title = m[1]; break; }
    }
  }

  // Discipline — line matching "по дисциплине:"
  for (const line of text) {
    const m = /^по\s+дисциплине[:\s]*«?([^»\n]+)»?\s*$/i.exec(line);
    if (m) { result.discipline = m[1].replace(/^«|»$/g, "").trim().slice(0, 200); break; }
  }

  // Author — after "Выполнил" / "Автор"
  for (const line of text) {
    const m = /(?:Выполнил\(?а?\)?|Автор|Студент(?:ка)?)[:\s]+([А-ЯЁA-Z][^\n,;]+)/.exec(line);
    if (m) {
      result.author = { name: m[1].trim().slice(0, 80), group: null, course: null };
      break;
    }
  }
  // Group
  for (const line of text) {
    const m = /Группа[:\s]+([A-Za-zА-Яа-я0-9\-\s]{2,20})/.exec(line);
    if (m && result.author) { result.author.group = m[1].trim(); break; }
  }
  // Course
  for (const line of text) {
    const m = /Курс[:\s]+([0-9]+(?:\s*курс)?)/i.exec(line);
    if (m && result.author) { result.author.course = m[1].trim(); break; }
  }

  // Supervisor
  for (const line of text) {
    const m = /(?:Руководитель|Научный\s+руководитель|Преподаватель)[:\s]+([А-ЯЁA-Z][^\n,;]+?)(?:,\s*([^\n]+))?$/.exec(line);
    if (m) {
      result.supervisor = {
        name: m[1].trim().slice(0, 80),
        role: "руководитель",
        degree: m[2] ? m[2].trim().slice(0, 80) : null,
      };
      break;
    }
  }

  // City + Year — line like "Москва, 2026" or "Москва 2026"
  for (const line of text) {
    const m = /^([А-ЯЁ][а-яё]+(?:[\s-][А-ЯЁа-яё]+){0,2})\s*[,]?\s*(\d{4})\s*$/.exec(line);
    if (m && parseInt(m[2], 10) >= 1900 && parseInt(m[2], 10) <= 2100) {
      result.city = m[1].trim();
      result.year = parseInt(m[2], 10);
      break;
    }
  }
  // Year alone
  if (!result.year) {
    for (const line of text) {
      const m = /^(\d{4})\s*г?\.?$/.exec(line);
      if (m && parseInt(m[1], 10) >= 1900 && parseInt(m[1], 10) <= 2100) {
        result.year = parseInt(m[1], 10);
        break;
      }
    }
  }

  // Faculty / Department — "Факультет" / "Кафедра"
  for (const line of text) {
    const mf = /^Факультет[:\s]*(.*)$/.exec(line);
    if (mf) { result.faculty = (mf[1] || "Факультет").trim().slice(0, 150); break; }
  }
  for (const line of text) {
    const md = /^Кафедра[:\s]*(.*)$/.exec(line);
    if (md) { result.department = (md[1] || "").trim().slice(0, 150); break; }
  }

  return result;
}
