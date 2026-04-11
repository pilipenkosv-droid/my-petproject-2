/**
 * Текстовые замены для всех параграфов документа
 *
 * Применяет:
 * - NBSP перед единицами измерения (5 мм → 5\u00A0мм)
 * - NBSP после инициалов (И. И. Иванов → И.\u00A0И.\u00A0Иванов)
 * - Замену запрещённых сокращений (т.д. → так далее)
 * - Замену прямых кавычек на угловые ("текст" → «текст»)
 * - Замену длинного тире на среднее (— → –)
 *
 * Работает с ordered-форматом fast-xml-parser (preserveOrder: true).
 */

import {
  type OrderedXmlNode,
  findChildren,
  getText,
  children,
  createNode,
  createTextNode,
} from "../xml/docx-xml";

const NBSP = "\u00A0";
const EN_DASH = "\u2013";
const EM_DASH = "\u2014";

/**
 * Маппинг сокращений → полное написание.
 * Ключ — нижний регистр для case-insensitive поиска.
 */
const ABBREVIATION_EXPANSIONS: Record<string, string> = {
  "т.д.": "так далее",
  "т.п.": "тому подобное",
  "т.е.": "то есть",
  "т.к.": "так как",
  "т.н.": "так называемый",
  "т.о.": "таким образом",
  "т.с.": "так сказать",
  "т.ч.": "так что",
  "г.о.": "главным образом",
  "д.б.": "должно быть",
  "м.б.": "может быть",
  "и др.": "и другие",
};

/**
 * NBSP перед единицами измерения
 */
function addNBSPBeforeUnits(text: string): string {
  return text.replace(
    /(\d)\s+(мм|см|дм|км|кг|мг|мл|мин|кВт|Вт|Гц|Па|МПа|дБ|об\/мин|м|г|л|с|ч|т|А|В|К|%|p\.|pp\.|pages?|с\.|стр\.)(?=[\s.,;:!?\-)}\]]|$)/gi,
    `$1${NBSP}$2`
  );
}

/**
 * NBSP после инициалов (И. И. Иванов → И.\u00A0И.\u00A0Иванов)
 */
function addNBSPAfterInitials(text: string): string {
  // Русские инициалы
  text = text
    .replace(/([А-ЯЁ])\.\s+([А-ЯЁ])\./g, `$1.${NBSP}$2.`)
    .replace(/([А-ЯЁ])\.\s+([А-ЯЁ][а-яё]+)/g, `$1.${NBSP}$2`);
  // Английские инициалы
  text = text
    .replace(/([A-Z])\.\s+([A-Z])\./g, `$1.${NBSP}$2.`)
    .replace(/([A-Z])\.\s+([A-Z][a-z]+)/g, `$1.${NBSP}$2`);
  return text;
}

/**
 * Замена прямых кавычек на угловые (русский текст)
 */
function fixQuotes(text: string): string {
  return text.replace(/"([^"]+)"/g, "\u00AB$1\u00BB");
}

/**
 * Замена длинного тире на среднее
 */
function fixDashes(text: string): string {
  return text.replace(new RegExp(EM_DASH, "g"), EN_DASH);
}

/**
 * Замена запрещённых сокращений на полное написание.
 * Учитывает контекст: "и т.д." → "и так далее", "и т. д." → "и так далее"
 */
function expandAbbreviations(text: string): string {
  for (const [abbr, expansion] of Object.entries(ABBREVIATION_EXPANSIONS)) {
    // Учитываем вариант с пробелом внутри: "т. д." и "т.д."
    const withSpace = abbr.replace(/\.(\S)/g, ". $1");
    // Экранируем точки для regex
    const escaped = abbr.replace(/\./g, "\\.").replace(/\//g, "\\/");
    const escapedWithSpace = withSpace.replace(/\./g, "\\.").replace(/\//g, "\\/");

    // Сначала вариант с пробелом (более длинный), потом без
    const pattern = new RegExp(`(${escapedWithSpace}|${escaped})`, "gi");
    text = text.replace(pattern, expansion);
  }
  return text;
}

/**
 * Удаляет ведущие пробелы/табуляции в начале текста параграфа.
 * Реальный отступ первой строки задаётся через w:ind firstLine в XML.
 * Пробелы-отступы — антипаттерн, нарушающий структуру документа.
 */
function stripLeadingSpaces(text: string): string {
  return text.replace(/^[\t ]{2,}/, "");
}

/**
 * Схлопывает множественные пробелы в один.
 * Два и более пробела подряд → один пробел.
 * Не трогает NBSP (\u00A0) — они вставляются намеренно.
 */
function collapseMultipleSpaces(text: string): string {
  return text.replace(/ {2,}/g, " ");
}

/**
 * Исправляет двойные точки → одна точка.
 * Не трогает "..." (троеточие) и "…" (символ троеточия).
 */
function fixDoubleDots(text: string): string {
  // Заменяем ровно 2 точки подряд (не часть троеточия) на одну
  return text.replace(/(?<!\.)\.\.(?!\.)/g, ".");
}

/**
 * Применяет все текстовые замены к тексту параграфа
 */
export function applyTextFixes(text: string): string {
  let result = text;
  result = stripLeadingSpaces(result);
  result = collapseMultipleSpaces(result);
  result = fixDoubleDots(result);
  result = expandAbbreviations(result);
  result = addNBSPBeforeUnits(result);
  result = addNBSPAfterInitials(result);
  result = fixQuotes(result);
  result = fixDashes(result);
  return result;
}

/**
 * Применяет текстовые замены к XML-параграфу.
 *
 * Собирает текст из всех w:t, применяет замены,
 * записывает результат обратно (весь текст в первый w:t).
 */
export function applyTextFixesToXmlParagraph(paragraph: OrderedXmlNode): boolean {
  const runs = findChildren(paragraph, "w:r");
  if (runs.length === 0) return false;

  // Собираем весь текст
  let fullText = "";
  for (const run of runs) {
    const tNodes = findChildren(run, "w:t");
    for (const tNode of tNodes) {
      fullText += getText(tNode);
    }
  }

  if (!fullText.trim()) return false;

  const fixedText = applyTextFixes(fullText);
  if (fixedText === fullText) return false;

  // Записываем результат — весь текст в первый w:t, остальные очищаем
  let written = false;
  for (const run of runs) {
    const runCh = children(run);
    for (let i = 0; i < runCh.length; i++) {
      if (!("w:t" in runCh[i])) continue;

      if (!written) {
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(fixedText),
        ]);
        written = true;
      } else {
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(""),
        ]);
      }
    }
  }

  return true;
}
