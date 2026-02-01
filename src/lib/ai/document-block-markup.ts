/**
 * AI-разметка блоков документа через AI Gateway
 *
 * Определяет тип каждого параграфа (заголовок, текст, библиография и т.д.)
 */

import { callAI } from "./gateway";
import {
  DocumentBlockMarkup,
  documentBlockMarkupSchema,
  BlockMarkupItem,
} from "./block-markup-schemas";
import {
  BLOCK_MARKUP_SYSTEM_PROMPT,
  createBlockMarkupPrompt,
} from "./block-markup-prompts";

/**
 * Создаёт fallback-разметку при ошибке AI — все параграфы получают тип unknown
 */
function createFallbackMarkup(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): DocumentBlockMarkup {
  const blocks: BlockMarkupItem[] = paragraphs.map((p) => ({
    paragraphIndex: p.index,
    blockType: p.text.trim() === "" ? ("empty" as const) : ("unknown" as const),
    confidence: 0,
  }));

  return {
    blocks,
    warnings: ["AI-разметка не удалась, используется fallback с типом unknown"],
  };
}

/**
 * Размечает параграфы документа по типам блоков через AI
 */
export async function parseDocumentBlocks(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Promise<DocumentBlockMarkup> {
  if (paragraphs.length === 0) {
    return { blocks: [], warnings: [] };
  }

  try {
    const response = await callAI({
      systemPrompt: BLOCK_MARKUP_SYSTEM_PROMPT,
      userPrompt: createBlockMarkupPrompt(paragraphs),
      temperature: 0.1,
    });

    const parsed = documentBlockMarkupSchema.parse(response.json);
    console.log(`[block-markup] Parsed via ${response.modelName}`);
    return parsed;
  } catch (error) {
    console.error("Error in AI block markup:", error);
    return createFallbackMarkup(paragraphs);
  }
}
