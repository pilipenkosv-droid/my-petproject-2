import { z } from "zod";

/**
 * Zod-схемы для structured output от AI
 * Используются для валидации ответов от OpenAI/Claude
 */

// Выравнивание текста
export const textAlignmentSchema = z.enum(["left", "center", "right", "justify"]);

// Размер страницы
export const pageSizeSchema = z.enum(["A4", "A5", "Letter", "Legal"]);

// Ориентация
export const pageOrientationSchema = z.enum(["portrait", "landscape"]);

// Поля документа
export const marginsSchema = z.object({
  top: z.number().min(0).max(100).describe("Верхнее поле в мм"),
  bottom: z.number().min(0).max(100).describe("Нижнее поле в мм"),
  left: z.number().min(0).max(100).describe("Левое поле в мм"),
  right: z.number().min(0).max(100).describe("Правое поле в мм"),
});

// Стиль заголовка
export const headingStyleSchema = z.object({
  fontFamily: z.string().optional().describe("Название шрифта"),
  fontSize: z.number().min(8).max(72).optional().describe("Размер шрифта в pt"),
  bold: z.boolean().optional().describe("Жирный текст"),
  italic: z.boolean().optional().describe("Курсив"),
  uppercase: z.boolean().optional().describe("Все заглавные буквы"),
  alignment: textAlignmentSchema.optional().describe("Выравнивание"),
  spaceBefore: z.number().min(0).max(100).optional().describe("Отступ сверху в pt"),
  spaceAfter: z.number().min(0).max(100).optional().describe("Отступ снизу в pt"),
  numbering: z.boolean().optional().describe("Нумерация заголовков"),
});

// Правила для списков
export const listRulesSchema = z.object({
  bulletStyle: z.string().optional().describe("Символ маркера списка"),
  numberingStyle: z.string().optional().describe("Формат нумерации"),
  indent: z.number().min(0).max(50).optional().describe("Отступ в мм"),
  spaceBetweenItems: z.number().min(0).max(50).optional().describe("Интервал между пунктами в pt"),
});

// Специальные элементы
export const titlePageRulesSchema = z.object({
  required: z.boolean().optional(),
  universityPosition: z.enum(["top", "center"]).optional(),
  titlePosition: z.enum(["center"]).optional(),
  authorPosition: z.enum(["right", "center"]).optional(),
  datePosition: z.enum(["bottom"]).optional(),
}).optional();

export const tocRulesSchema = z.object({
  required: z.boolean().optional(),
  title: z.string().optional(),
  showPageNumbers: z.boolean().optional(),
  dotLeaders: z.boolean().optional(),
  maxLevel: z.number().min(1).max(6).optional(),
}).optional();

export const bibliographyStyleSchema = z.enum(["gost", "apa", "mla", "chicago", "ieee"]);

export const bibliographyRulesSchema = z.object({
  required: z.boolean().optional(),
  title: z.string().optional(),
  style: bibliographyStyleSchema.optional(),
  sortOrder: z.enum(["alphabetical", "appearance"]).optional(),
  numbering: z.boolean().optional(),
}).optional();

export const figureRulesSchema = z.object({
  captionPosition: z.enum(["above", "below"]).optional(),
  captionPrefix: z.string().optional(),
  numbering: z.enum(["continuous", "by-chapter"]).optional(),
  alignment: textAlignmentSchema.optional(),
}).optional();

export const tableRulesSchema = z.object({
  captionPosition: z.enum(["above", "below"]).optional(),
  captionPrefix: z.string().optional(),
  numbering: z.enum(["continuous", "by-chapter"]).optional(),
  headerStyle: z.enum(["bold", "normal"]).optional(),
  borders: z.boolean().optional(),
}).optional();

export const footnoteRulesSchema = z.object({
  position: z.enum(["bottom", "end"]).optional(),
  numbering: z.enum(["continuous", "by-page", "by-chapter"]).optional(),
  fontSize: z.number().min(6).max(14).optional(),
}).optional();

// Дополнительные правила
export const pageNumberingSchema = z.object({
  position: z.enum(["top", "bottom"]).optional(),
  alignment: textAlignmentSchema.optional(),
  startFrom: z.number().min(0).optional(),
  skipFirstPage: z.boolean().optional(),
}).optional();

export const nonBreakingSpacesSchema = z.object({
  beforeUnits: z.boolean().optional(),
  afterInitials: z.boolean().optional(),
  inDates: z.boolean().optional(),
}).optional();

// Полная схема правил форматирования
export const formattingRulesSchema = z.object({
  document: z.object({
    pageSize: pageSizeSchema.describe("Размер страницы"),
    margins: marginsSchema.describe("Поля документа"),
    orientation: pageOrientationSchema.describe("Ориентация страницы"),
  }).describe("Параметры страницы"),

  text: z.object({
    fontFamily: z.string().describe("Название шрифта основного текста"),
    fontSize: z.number().min(8).max(72).describe("Размер шрифта основного текста в pt"),
    lineSpacing: z.number().min(1).max(3).describe("Межстрочный интервал"),
    paragraphIndent: z.number().min(0).max(50).describe("Абзацный отступ в мм"),
    alignment: textAlignmentSchema.describe("Выравнивание основного текста"),
    spaceBetweenParagraphs: z.number().min(0).max(50).optional().describe("Интервал между абзацами в pt"),
  }).describe("Параметры основного текста"),

  headings: z.object({
    level1: headingStyleSchema.describe("Стиль заголовка 1 уровня (главы)"),
    level2: headingStyleSchema.describe("Стиль заголовка 2 уровня (разделы)"),
    level3: headingStyleSchema.describe("Стиль заголовка 3 уровня (подразделы)"),
    level4: headingStyleSchema.optional().describe("Стиль заголовка 4 уровня"),
  }).describe("Стили заголовков"),

  lists: listRulesSchema.describe("Правила оформления списков"),

  specialElements: z.object({
    titlePage: titlePageRulesSchema.describe("Правила титульного листа"),
    tableOfContents: tocRulesSchema.describe("Правила оглавления"),
    bibliography: bibliographyRulesSchema.describe("Правила списка литературы"),
    figures: figureRulesSchema.describe("Правила оформления рисунков"),
    tables: tableRulesSchema.describe("Правила оформления таблиц"),
    footnotes: footnoteRulesSchema.describe("Правила оформления сносок"),
  }).describe("Специальные элементы документа"),

  additional: z.object({
    pageNumbering: pageNumberingSchema.describe("Нумерация страниц"),
    nonBreakingSpaces: nonBreakingSpacesSchema.describe("Неразрывные пробелы"),
  }).optional().describe("Дополнительные правила"),
});

// Тип для результата парсинга
export type ParsedFormattingRules = z.infer<typeof formattingRulesSchema>;

// Схема для ответа AI с метаинформацией
export const aiParsingResponseSchema = z.object({
  rules: formattingRulesSchema,
  confidence: z.number().min(0).max(1).describe("Уверенность в корректности парсинга от 0 до 1"),
  warnings: z.array(z.string()).describe("Предупреждения о неопределённых или неоднозначных требованиях"),
  missingRules: z.array(z.string()).describe("Правила, которые не удалось определить из документа"),
});

export type AIParsingResponse = z.infer<typeof aiParsingResponseSchema>;
