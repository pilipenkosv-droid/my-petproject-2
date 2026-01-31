/**
 * Zod-схемы для AI-разметки блоков документа
 *
 * Каждый параграф docx-файла размечается по типу блока,
 * что позволяет применять правильное форматирование.
 */

import { z } from "zod";

export const blockTypeSchema = z.enum([
  "title_page",
  "toc",
  "toc_entry",
  "heading_1",
  "heading_2",
  "heading_3",
  "heading_4",
  "body_text",
  "list_item",
  "quote",
  "figure",
  "figure_caption",
  "table",
  "table_caption",
  "formula",
  "bibliography_title",
  "bibliography_entry",
  "appendix_title",
  "appendix_content",
  "footnote",
  "page_number",
  "empty",
  "unknown",
]);

export type BlockType = z.infer<typeof blockTypeSchema>;

export const blockMarkupItemSchema = z.object({
  paragraphIndex: z.number().min(0),
  blockType: blockTypeSchema,
  confidence: z.number().min(0).max(1),
  metadata: z
    .object({
      language: z.enum(["ru", "en", "mixed"]).optional(),
      headingLevel: z.number().min(1).max(4).optional(),
      listLevel: z.number().min(1).max(4).optional(),
    })
    .optional(),
});

export type BlockMarkupItem = z.infer<typeof blockMarkupItemSchema>;

export const documentBlockMarkupSchema = z.object({
  blocks: z.array(blockMarkupItemSchema),
  warnings: z.array(z.string()).optional(),
});

export type DocumentBlockMarkup = z.infer<typeof documentBlockMarkupSchema>;
