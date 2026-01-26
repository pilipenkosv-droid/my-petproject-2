/**
 * Zod-схемы для валидации семантической структуры документа
 * 
 * Используются для проверки ответа AI при семантическом анализе документа.
 */

import { z } from "zod";

/**
 * Тип секции документа
 */
export const sectionTypeSchema = z.enum([
  "title",        // Титульный лист
  "abstract",     // Аннотация/реферат
  "toc",          // Содержание/оглавление
  "intro",        // Введение
  "chapter",      // Глава/раздел
  "conclusion",   // Заключение
  "bibliography", // Список литературы
  "appendix",     // Приложение
  "other",        // Прочее
]);

/**
 * Язык текста
 */
export const languageSchema = z.enum(["ru", "en", "mixed"]);

/**
 * Метаданные секции
 */
export const sectionMetadataSchema = z.object({
  chapterNumber: z.string().optional(),
  title: z.string().optional(),
  language: languageSchema.optional(),
});

/**
 * Секция документа
 */
export const documentSectionSchema = z.object({
  type: sectionTypeSchema,
  level: z.number().min(1).max(4).optional(), // Для заголовков
  startParagraph: z.number().min(0),
  endParagraph: z.number().min(0),
  metadata: sectionMetadataSchema.optional(),
});

/**
 * Проблемы форматирования в записи библиографии
 */
export const bibliographyProblemSchema = z.enum([
  "missing-nbsp-initials",     // Отсутствуют неразрывные пробелы в инициалах
  "wrong-quotes",              // Неверные кавычки
  "wrong-dash",                // Неверное тире
  "missing-numbering",         // Отсутствует нумерация
  "wrong-numbering-format",    // Неверный формат нумерации
  "inconsistent-format",       // Несогласованный формат записи
]);

/**
 * Запись в списке литературы
 */
export const bibliographyEntrySchema = z.object({
  paragraphIndex: z.number().min(0),
  authors: z.string(),
  title: z.string(),
  language: languageSchema,
  hasProblems: z.array(bibliographyProblemSchema),
  rawText: z.string().optional(), // Исходный текст записи
});

/**
 * Секция библиографии
 */
export const bibliographySectionSchema = z.object({
  startParagraph: z.number().min(0),
  endParagraph: z.number().min(0),
  hasNumbering: z.boolean(),
  numberingFormat: z.string().optional(), // "1.", "1)", "[1]"
  entries: z.array(bibliographyEntrySchema),
});

/**
 * Семантическая структура всего документа
 */
export const semanticStructureSchema = z.object({
  sections: z.array(documentSectionSchema),
  bibliography: bibliographySectionSchema.optional(),
  confidence: z.number().min(0).max(1), // Уверенность AI в разметке
  warnings: z.array(z.string()).optional(), // Предупреждения
});

/**
 * Типы для TypeScript
 */
export type SectionType = z.infer<typeof sectionTypeSchema>;
export type Language = z.infer<typeof languageSchema>;
export type SectionMetadata = z.infer<typeof sectionMetadataSchema>;
export type DocumentSection = z.infer<typeof documentSectionSchema>;
export type BibliographyProblem = z.infer<typeof bibliographyProblemSchema>;
export type BibliographyEntry = z.infer<typeof bibliographyEntrySchema>;
export type BibliographySection = z.infer<typeof bibliographySectionSchema>;
export type SemanticStructure = z.infer<typeof semanticStructureSchema>;
