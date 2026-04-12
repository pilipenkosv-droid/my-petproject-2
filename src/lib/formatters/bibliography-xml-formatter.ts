/**
 * XML-форматтер для библиографии
 *
 * Применяет текстовые замены непосредственно в XML-элементах w:t
 * для параграфов, размеченных как bibliography_entry.
 *
 * Работает с ordered-форматом fast-xml-parser (preserveOrder: true).
 */

import {
  type OrderedXmlNode,
  findChildren,
  getText,
} from "../xml/docx-xml";
import {
  collectRunSegments,
  redistributeText,
  writeBackSegments,
} from "./text-fixes-xml-formatter";

const NBSP = "\u00A0";
const EN_DASH = "\u2013";
const EM_DASH = "\u2014";

/**
 * Форматирует инициалы в библиографии — добавляет неразрывные пробелы.
 *
 * 1. Между фамилией и инициалами: Ахутина Т.В. → Ахутина←NBSP→Т.В.
 * 2. Между инициалами: Т. В. → Т.←NBSP→В.
 *
 * НЕ добавляет NBSP между инициалом и словом-названием (В. Порождение),
 * т.к. это ошибочно связывало бы инициал автора с первым словом заглавия.
 */
function formatInitialsWithNBSP(text: string, language?: string): string {
  if (!language || language === "ru") {
    // Между инициалами: Т. В. → Т.←NBSP→В.
    text = text.replace(/([А-ЯЁ])\.\s+([А-ЯЁ])\./g, `$1.${NBSP}$2.`);
    // Фамилия + инициал: Ахутина Т. → Ахутина←NBSP→Т.
    text = text.replace(/([А-ЯЁ][а-яё]{1,})\s+([А-ЯЁ]\.)/g, `$1${NBSP}$2`);
    // Инициал + Фамилия: Л.С. Выготский → Л.С.←NBSP→Выготский
    text = text.replace(/([А-ЯЁ]\.)\s+([А-ЯЁ][а-яё]{2,})/g, `$1${NBSP}$2`);
  }
  if (!language || language === "en") {
    text = text.replace(/([A-Z])\.\s+([A-Z])\./g, `$1.${NBSP}$2.`);
    text = text.replace(/([A-Z][a-z]{1,})\s+([A-Z]\.)/g, `$1${NBSP}$2`);
    // Initial + Surname: J.K. Rowling → J.K.←NBSP→Rowling
    text = text.replace(/([A-Z]\.)\s+([A-Z][a-z]{2,})/g, `$1${NBSP}$2`);
  }
  return text;
}

/**
 * Заменяет прямые кавычки на угловые (для русского текста)
 */
function fixQuotes(text: string, language?: string): string {
  if (!language || language === "ru") {
    text = text.replace(/"([^"]+)"/g, "\u00AB$1\u00BB");
  }
  return text;
}

/**
 * Заменяет длинное тире на среднее
 */
function fixDashes(text: string): string {
  return text.replace(new RegExp(EM_DASH, "g"), EN_DASH);
}

/**
 * Добавляет неразрывные пробелы перед единицами измерения и стр./с.
 */
function addNBSPBeforeUnits(text: string): string {
  return text.replace(
    /(\d)\s+(мм|см|м|км|кг|г|мг|л|мл|с|мин|ч|%|p\.|pp\.|pages?|с\.|стр\.)/gi,
    `$1${NBSP}$2`
  );
}

/**
 * Применяет все текстовые замены к одной записи библиографии
 */
export function formatBibliographyText(
  text: string,
  language?: string
): string {
  let result = text;
  result = formatInitialsWithNBSP(result, language);
  result = fixQuotes(result, language);
  result = fixDashes(result);
  result = addNBSPBeforeUnits(result);
  return result;
}

/**
 * Применяет форматирование библиографии к XML-параграфу, сохраняя per-run форматирование.
 */
export function applyBibliographyFormattingToXmlParagraph(
  paragraph: OrderedXmlNode,
  language?: string
): void {
  const segments = collectRunSegments(paragraph);
  if (segments.length === 0) return;

  const fullText = segments.map((s) => s.text).join("");
  if (!fullText.trim()) return;

  const formattedText = formatBibliographyText(fullText, language);
  if (formattedText === fullText) return;

  redistributeText(segments, fullText, formattedText);
  writeBackSegments(segments);
}
