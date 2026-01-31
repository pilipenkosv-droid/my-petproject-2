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
  children,
  createNode,
  createTextNode,
} from "../xml/docx-xml";

const NBSP = "\u00A0";
const EN_DASH = "\u2013";
const EM_DASH = "\u2014";

/**
 * Форматирует инициалы — добавляет неразрывные пробелы
 */
function formatInitialsWithNBSP(text: string, language?: string): string {
  if (!language || language === "ru") {
    text = text
      .replace(/([А-ЯЁ])\.\s+([А-ЯЁ])\./g, `$1.${NBSP}$2.`)
      .replace(/([А-ЯЁ])\.\s+([А-ЯЁ][а-яё]+)/g, `$1.${NBSP}$2`);
  }
  if (!language || language === "en") {
    text = text
      .replace(/([A-Z])\.\s+([A-Z])\./g, `$1.${NBSP}$2.`)
      .replace(/([A-Z])\.\s+([A-Z][a-z]+)/g, `$1.${NBSP}$2`);
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
 * Применяет форматирование библиографии к XML-параграфу (ordered-формат).
 *
 * Находит все w:t элементы, объединяет текст, применяет замены,
 * записывает результат обратно в первый w:t (остальные очищает).
 */
export function applyBibliographyFormattingToXmlParagraph(
  paragraph: OrderedXmlNode,
  language?: string
): void {
  const runs = findChildren(paragraph, "w:r");
  if (runs.length === 0) return;

  // Собираем весь текст из всех w:t во всех runs
  let fullText = "";
  for (const run of runs) {
    const tNodes = findChildren(run, "w:t");
    for (const tNode of tNodes) {
      fullText += getText(tNode);
    }
  }

  if (!fullText.trim()) return;

  // Применяем форматирование
  const formattedText = formatBibliographyText(fullText, language);

  if (formattedText === fullText) return; // Ничего не изменилось

  // Записываем результат — весь текст в первый w:t первого run, остальные очищаем
  let written = false;
  for (const run of runs) {
    const runCh = children(run);

    for (let i = 0; i < runCh.length; i++) {
      if (!("w:t" in runCh[i])) continue;

      if (!written) {
        // Заменяем первый w:t на новый с отформатированным текстом
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(formattedText),
        ]);
        written = true;
      } else {
        // Очищаем остальные w:t
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(""),
        ]);
      }
    }
  }
}
