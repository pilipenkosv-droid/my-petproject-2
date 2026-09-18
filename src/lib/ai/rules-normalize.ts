/**
 * Приведение ответа модели к именам полей схемы.
 *
 * Схема уходит и в тело запроса, и в промпт, но шлюз может проигнорировать
 * response_format (каталог google/gemini-2.5-flash его не перечисляет), и модель
 * возвращает свои имена: page_setup, fonts, references_and_bibliography.
 * Этот проход — второй пояс: snake_case → camelCase плюс карта синонимов
 * для секций верхнего уровня. Если и после него в правилах нет ни одного листа,
 * разбор считается провалившимся — молчаливой подмены на ГОСТ быть не должно.
 */

import { getRulesSectionKeys } from "./rules-schema";

type Json = Record<string, unknown>;

/** Синонимы секций верхнего уровня → имена из схемы. */
const SECTION_SYNONYMS: Record<string, string> = {
  pagesetup: "document",
  page: "document",
  pageparameters: "document",
  pagesettings: "document",
  documentsettings: "document",
  fonts: "text",
  font: "text",
  body: "text",
  bodytext: "text",
  maintext: "text",
  paragraphformatting: "text",
  paragraph: "text",
  paragraphs: "text",
  typography: "text",
  titles: "headings",
  heading: "headings",
  sections: "headings",
  list: "lists",
  enumerations: "lists",
  bulletlists: "lists",
  specialelements: "specialElements",
  elements: "specialElements",
  referencesandbibliography: "specialElements",
  references: "specialElements",
  bibliographyandreferences: "specialElements",
  structure: "specialElements",
  other: "additional",
  misc: "additional",
  extra: "additional",
};

function toCamel(key: string): string {
  return key.replace(/[_\-\s]+(\w)/g, (_, c: string) => c.toUpperCase());
}

/** snake/kebab/пробелы → camelCase; синонимы секций — по карте. */
function normalizeKey(key: string, sectionLevel: boolean): string {
  const camel = toCamel(key.trim());
  if (!sectionLevel) return camel;
  const flat = camel.toLowerCase();
  const known = getRulesSectionKeys();
  if (known.includes(camel)) return camel;
  return SECTION_SYNONYMS[flat] ?? camel;
}

/** Рекурсивный проход по ключам. sectionLevel — только секции внутри rules. */
function walk(value: unknown, sectionLevel: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => walk(v, false));
  if (!value || typeof value !== "object") return value;
  const out: Json = {};
  for (const [k, v] of Object.entries(value as Json)) {
    const key = normalizeKey(k, sectionLevel);
    // Слияние, а не перезапись: page_setup и pageSetup могут прийти вместе.
    const walked = walk(v, false);
    const prev = out[key];
    out[key] =
      prev && typeof prev === "object" && !Array.isArray(prev) &&
      walked && typeof walked === "object" && !Array.isArray(walked)
        ? { ...(prev as Json), ...(walked as Json) }
        : walked;
  }
  return out;
}

/** Убирает null/undefined-листья: strict-схема заставляет модель слать null. */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls).filter((v) => v !== null && v !== undefined);
  if (!value || typeof value !== "object") return value;
  const out: Json = {};
  for (const [k, v] of Object.entries(value as Json)) {
    if (v === null || v === undefined) continue;
    const cleaned = stripNulls(v);
    // Пустой объект после чистки не несёт правил — выбрасываем.
    if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) &&
        Object.keys(cleaned as Json).length === 0) {
      continue;
    }
    out[k] = cleaned;
  }
  return out;
}

/** Нормализация имён полей ответа целиком (rules + мета-поля). */
export function normalizeResponseKeys(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const src = value as Json;
  const out: Json = {};
  for (const [k, v] of Object.entries(src)) {
    const key = toCamel(k.trim());
    const mapped =
      key === "rules" || key === "formattingRules" || key === "formatting" ? "rules" : key;
    out[mapped] = mapped === "rules" ? walk(v, true) : walk(v, false);
  }
  // Модель может вернуть секции сразу верхним уровнем, без обёртки rules.
  if (!out.rules && getRulesSectionKeys().some((k) => k in out)) {
    return { rules: walk(src, true) };
  }
  return out;
}

/** Сколько листьев с правилами реально извлечено. */
export function countRuleLeaves(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + countRuleLeaves(v), 0);
  if (typeof value === "object") {
    return Object.values(value as Json).reduce<number>((n, v) => n + countRuleLeaves(v), 0);
  }
  return 1;
}

/**
 * Удаляет из ответа листья, на которые ругался Zod.
 *
 * Strict-схема провайдера не переносит minimum/maximum, поэтому модель может
 * вернуть, например, fontSize: 1.5. Ронять из-за одного поля весь разбор нельзя:
 * в ответе рядом лежат десятки корректных правил, и пользователь остался бы
 * без своей методички. Битый лист выбрасываем, остальное сохраняем.
 */
export function dropIssuePaths(
  value: unknown,
  paths: Array<Array<string | number>>
): { value: unknown; dropped: string[] } {
  const clone = structuredClone(value) as Json;
  const dropped: string[] = [];

  for (const path of paths) {
    if (path.length === 0) continue;
    let node: unknown = clone;
    for (const key of path.slice(0, -1)) {
      if (!node || typeof node !== "object") { node = undefined; break; }
      node = (node as Json)[String(key)];
    }
    if (!node || typeof node !== "object") continue;

    const last = path[path.length - 1];
    if (Array.isArray(node) && typeof last === "number") {
      node.splice(last, 1);
    } else {
      delete (node as Json)[String(last)];
    }
    dropped.push(path.join("."));
  }

  return { value: clone, dropped };
}

/**
 * Провенанс: схема просит {секция: [номера]}, но модель для составных секций
 * (specialElements, additional) охотно возвращает вложенный объект вида
 * {"specialElements": {"tables": [3], "figures": [7]}}. Живая проверка 18.09:
 * так отвечали 5 методичек из 6, и Zod выбрасывал эти секции целиком.
 * Собираем из любой вложенности целые неотрицательные номера.
 */
export function flattenProvenance(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;

  const collect = (node: unknown, out: Set<number>): void => {
    if (typeof node === "number" && Number.isInteger(node) && node >= 0) out.add(node);
    else if (Array.isArray(node)) for (const child of node) collect(child, out);
    else if (node && typeof node === "object") for (const child of Object.values(node)) collect(child, out);
  };

  const result: Json = {};
  for (const [section, value] of Object.entries(raw as Json)) {
    const ids = new Set<number>();
    collect(value, ids);
    if (ids.size > 0) result[section] = [...ids].sort((a, b) => a - b);
  }
  return result;
}
