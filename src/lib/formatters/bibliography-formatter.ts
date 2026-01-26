/**
 * Специализированный форматтер для списка литературы
 * 
 * Обрабатывает библиографию с учетом:
 * - Нумерации по правилам методички
 * - Неразрывных пробелов в инициалах (И.�И.�Иванов)
 * - Правильных кавычек (« » для русского, " " для английского)
 * - Правильного тире (– среднее, не — длинное)
 */

import {
  Paragraph,
  TextRun,
  AlignmentType,
  convertMillimetersToTwip,
} from "docx";
import { FormattingRules } from "@/types/formatting-rules";
import {
  BibliographyEntry,
  BibliographySection,
  Language,
} from "../ai/semantic-schemas";

/**
 * Символы для замены
 */
const NBSP = "\u00A0"; // Неразрывный пробел
const NARROW_NBSP = "\u202F"; // Узкий неразрывный пробел
const EN_DASH = "–"; // Среднее тире
const EM_DASH = "—"; // Длинное тире (запрещено)

/**
 * Форматирует инициалы с неразрывными пробелами
 * 
 * Примеры:
 * - "Иванов И. И." → "Иванов И.�И."
 * - "Smith J. D." → "Smith J.�D."
 */
function formatInitialsWithNBSP(text: string, language: Language): string {
  if (language === "ru") {
    // Русские инициалы: И. И. Иванов или Иванов И. И.
    // Паттерн: буква + точка + пробел + буква + точка
    return text.replace(
      /([А-ЯЁ])\.\s+([А-ЯЁ])\./g,
      `$1.${NBSP}$2.`
    ).replace(
      /([А-ЯЁ])\.\s+([А-ЯЁ][а-яё]+)/g,
      `$1.${NBSP}$2`
    );
  } else if (language === "en") {
    // Английские инициалы: Smith J. D. или Smith, J. D.
    return text.replace(
      /([A-Z])\.\s+([A-Z])\./g,
      `$1.${NBSP}$2.`
    ).replace(
      /([A-Z])\.\s+([A-Z][a-z]+)/g,
      `$1.${NBSP}$2`
    );
  }
  
  return text;
}

/**
 * Заменяет неправильные кавычки на правильные
 */
function fixQuotes(text: string, language: Language): string {
  if (language === "ru") {
    // Русский: прямые " " → угловые « »
    return text
      .replace(/"([^"]+)"/g, "«$1»")
      .replace(/'([^']+)'/g, "«$1»");
  } else if (language === "en") {
    // Английский: оставляем прямые кавычки
    return text;
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
 * Добавляет неразрывные пробелы перед единицами измерения
 */
function addNBSPBeforeUnits(text: string): string {
  // Паттерн: цифра + пробел + единица
  return text.replace(
    /(\d)\s+(мм|см|м|км|кг|г|мг|л|мл|с|мин|ч|%|p\.|pp\.|pages?|с\.|стр\.)/gi,
    `$1${NBSP}$2`
  );
}

/**
 * Комплексное форматирование записи библиографии
 */
export function formatBibliographyEntry(
  entry: BibliographyEntry,
  rules: FormattingRules
): string {
  let text = entry.rawText || `${entry.authors} ${entry.title}`;

  // Применяем форматирование в порядке важности
  text = formatInitialsWithNBSP(text, entry.language);
  text = fixQuotes(text, entry.language);
  text = fixDashes(text);
  text = addNBSPBeforeUnits(text);

  return text;
}

/**
 * Добавляет нумерацию к записи
 */
export function addNumberingToEntry(
  index: number,
  text: string,
  numberingStyle: string
): string {
  const number = index + 1;

  switch (numberingStyle) {
    case "1.":
      return `${number}. ${text}`;
    case "1)":
      return `${number}) ${text}`;
    case "[1]":
      return `[${number}] ${text}`;
    default:
      return `${number}. ${text}`;
  }
}

/**
 * Создает параграфы для секции библиографии
 */
export function createBibliographyParagraphs(
  bibliography: BibliographySection,
  rules: FormattingRules
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Заголовок "Список литературы"
  const bibliographyTitle =
    rules.specialElements?.bibliography?.title ||
    "Список используемой литературы и используемых источников";

  paragraphs.push(
    new Paragraph({
      text: bibliographyTitle,
      heading: 1 as any,
      alignment: AlignmentType.CENTER,
      spacing: {
        before: convertMillimetersToTwip(10),
        after: convertMillimetersToTwip(10),
      },
      children: [
        new TextRun({
          text: bibliographyTitle,
          font: rules.text.fontFamily,
          size: (rules.headings.level1.fontSize || 16) * 2,
          bold: rules.headings.level1.bold ?? true,
        }),
      ],
    })
  );

  // Записи библиографии
  const numberingStyle =
    rules.specialElements?.bibliography?.numberingStyle || "1.";
  const hasNumbering =
    bibliography.hasNumbering ??
    rules.specialElements?.bibliography?.numbering ??
    true;

  bibliography.entries.forEach((entry, index) => {
    let formattedText = formatBibliographyEntry(entry, rules);

    // Добавляем нумерацию если требуется
    if (hasNumbering && !bibliography.hasNumbering) {
      // Только если в оригинале нет нумерации, но по правилам должна быть
      formattedText = addNumberingToEntry(index, formattedText, numberingStyle);
    } else if (hasNumbering && bibliography.hasNumbering) {
      // Если нумерация есть, но нужно исправить формат
      // Убираем старую нумерацию
      formattedText = formattedText.replace(/^\[?\d+[\.\)]\]?\s*/, "");
      formattedText = addNumberingToEntry(index, formattedText, numberingStyle);
    }

    paragraphs.push(
      new Paragraph({
        text: formattedText,
        alignment: AlignmentType.JUSTIFIED,
        indent: {
          left: convertMillimetersToTwip(0),
          hanging: hasNumbering ? convertMillimetersToTwip(8) : 0,
        },
        spacing: {
          line: rules.text.lineSpacing * 240,
          after: convertMillimetersToTwip(3),
        },
        children: [
          new TextRun({
            text: formattedText,
            font: rules.text.fontFamily,
            size: rules.text.fontSize * 2,
          }),
        ],
      })
    );
  });

  return paragraphs;
}

/**
 * Определяет, нужна ли нумерация в списке литературы
 */
export function shouldAddNumbering(
  bibliography: BibliographySection,
  rules: FormattingRules
): boolean {
  // Если в правилах явно указано
  if (rules.specialElements?.bibliography?.numbering !== undefined) {
    return rules.specialElements.bibliography.numbering;
  }

  // Если в оригинале нет нумерации, но по стандарту ГОСТ она нужна
  if (!bibliography.hasNumbering && rules.specialElements?.bibliography?.style === "gost") {
    return true;
  }

  return bibliography.hasNumbering;
}

/**
 * Валидация записи библиографии
 */
export function validateBibliographyEntry(
  entry: BibliographyEntry
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!entry.authors || entry.authors.trim().length === 0) {
    errors.push("Отсутствуют авторы");
  }

  if (!entry.title || entry.title.trim().length === 0) {
    errors.push("Отсутствует название");
  }

  if (!entry.rawText || entry.rawText.trim().length === 0) {
    errors.push("Отсутствует исходный текст записи");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
