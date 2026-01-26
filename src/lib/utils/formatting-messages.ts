/**
 * Утилиты для форматирования сообщений об ошибках форматирования
 * Переводит технические значения в человекочитаемый формат
 */

/**
 * Карта выравнивания: технический формат → человекочитаемый
 */
const ALIGNMENT_LABELS: Record<string, string> = {
  left: "по левому краю",
  right: "по правому краю",
  center: "по центру",
  justify: "по ширине",
  both: "по ширине",
};

/**
 * Карта шрифтов: технический формат → отображаемый формат
 */
const FONT_LABELS: Record<string, string> = {
  "Times New Roman": "Times New Roman",
  "Arial": "Arial",
  "Calibri": "Calibri",
  "Georgia": "Georgia",
};

/**
 * Преобразовать выравнивание в человекочитаемый формат
 */
export function formatAlignment(alignment: string): string {
  return ALIGNMENT_LABELS[alignment] || alignment;
}

/**
 * Преобразовать название шрифта в отображаемый формат
 */
export function formatFontFamily(fontFamily: string): string {
  return FONT_LABELS[fontFamily] || fontFamily;
}

/**
 * Преобразовать размер шрифта в человекочитаемый формат
 */
export function formatFontSize(size: string): string {
  // Убираем " pt" если есть, добавляем " пт"
  const numericSize = size.replace(/\s*pt\s*$/i, "");
  return `${numericSize} пт`;
}

/**
 * Преобразовать межстрочный интервал в человекочитаемый формат
 */
export function formatLineSpacing(spacing: string | number): string {
  const numericSpacing = typeof spacing === "string" 
    ? parseFloat(spacing) 
    : spacing;
  
  if (numericSpacing === 1.0) return "одинарный";
  if (numericSpacing === 1.5) return "полуторный";
  if (numericSpacing === 2.0) return "двойной";
  
  return String(numericSpacing);
}

/**
 * Преобразовать отступ в человекочитаемый формат
 */
export function formatIndent(indent: string): string {
  // Убираем " мм" если есть, добавляем " мм" единообразно
  const numericIndent = indent.replace(/\s*мм\s*$/i, "");
  return `${numericIndent} мм`;
}

/**
 * Преобразовать размер поля в человекочитаемый формат
 */
export function formatMargin(margin: string): string {
  return formatIndent(margin);
}

/**
 * Преобразовать тип кавычек в человекочитаемый формат
 */
export function formatQuoteType(quoteType: string): string {
  if (quoteType.includes("«") || quoteType.includes("»") || quoteType === "angular") {
    return "угловые кавычки «»";
  }
  if (quoteType.includes('"') || quoteType === "straight") {
    return 'прямые кавычки ""';
  }
  return quoteType;
}

/**
 * Преобразовать тип тире в человекочитаемый формат
 */
export function formatDashType(dashType: string): string {
  if (dashType.includes("—") || dashType === "em-dash" || dashType === "длинное тире (—)") {
    return "длинное тире (—)";
  }
  if (dashType.includes("–") || dashType === "en-dash") {
    return "среднее тире (–)";
  }
  if (dashType.includes("-") || dashType === "hyphen") {
    return "дефис (-)";
  }
  return dashType;
}

/**
 * Преобразовать тип пробела в человекочитаемый формат
 */
export function formatSpaceType(spaceType: string): string {
  if (spaceType.includes("неразрывн")) {
    return "неразрывный пробел";
  }
  if (spaceType.includes("обычн")) {
    return "обычный пробел";
  }
  return spaceType;
}

/**
 * Основная функция для форматирования нарушения в человекочитаемый вид
 * Используется при формировании комментариев в документе
 */
export function formatViolationMessage(
  message: string,
  expected: string,
  actual: string,
  ruleId: string
): string {
  let formattedExpected = expected;
  let formattedActual = actual;

  // Определяем тип правила и применяем соответствующее форматирование
  if (ruleId.includes("align")) {
    // Выравнивание текста
    formattedExpected = formatAlignment(expected);
    formattedActual = formatAlignment(actual);
  } else if (ruleId.includes("font") && ruleId.includes("size")) {
    // Размер шрифта
    formattedExpected = formatFontSize(expected);
    formattedActual = formatFontSize(actual);
  } else if (ruleId.includes("font")) {
    // Семейство шрифта
    formattedExpected = formatFontFamily(expected);
    formattedActual = formatFontFamily(actual);
  } else if (ruleId.includes("spacing")) {
    // Межстрочный интервал
    formattedExpected = formatLineSpacing(expected);
    formattedActual = formatLineSpacing(actual);
  } else if (ruleId.includes("indent")) {
    // Отступы
    formattedExpected = formatIndent(expected);
    formattedActual = formatIndent(actual);
  } else if (ruleId.includes("margin")) {
    // Поля страницы
    formattedExpected = formatMargin(expected);
    formattedActual = formatMargin(actual);
  } else if (ruleId.includes("quotes")) {
    // Кавычки
    formattedExpected = formatQuoteType(expected);
    formattedActual = formatQuoteType(actual);
  } else if (ruleId.includes("dash")) {
    // Тире
    formattedExpected = formatDashType(expected);
    formattedActual = formatDashType(actual);
  } else if (ruleId.includes("nbsp") || ruleId.includes("space")) {
    // Пробелы
    formattedExpected = formatSpaceType(expected);
    formattedActual = formatSpaceType(actual);
  }

  return `${message}: ожидается "${formattedExpected}", найдено "${formattedActual}"`;
}
