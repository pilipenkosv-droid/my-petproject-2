/**
 * AI-разметка блоков документа через AI Gateway
 *
 * Определяет тип каждого параграфа (заголовок, текст, библиография и т.д.)
 * Большие документы автоматически разбиваются на чанки.
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

/** Максимум параграфов в одном AI-запросе */
const CHUNK_SIZE = 150;

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
 * Размечает один чанк параграфов через AI
 */
async function parseChunk(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Promise<DocumentBlockMarkup> {
  const response = await callAI({
    systemPrompt: BLOCK_MARKUP_SYSTEM_PROMPT,
    userPrompt: createBlockMarkupPrompt(paragraphs),
    temperature: 0.1,
  });

  const parsed = documentBlockMarkupSchema.parse(response.json);
  console.log(
    `[block-markup] Chunk (${paragraphs.length} paragraphs) parsed via ${response.modelName}`
  );
  return parsed;
}

/**
 * Размечает параграфы документа по типам блоков через AI.
 * Документы с >CHUNK_SIZE параграфов разбиваются на чанки и обрабатываются последовательно.
 */
export async function parseDocumentBlocks(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Promise<DocumentBlockMarkup> {
  if (paragraphs.length === 0) {
    return { blocks: [], warnings: [] };
  }

  // Маленький документ — один запрос
  if (paragraphs.length <= CHUNK_SIZE) {
    try {
      return await parseChunk(paragraphs);
    } catch (error) {
      console.error("Error in AI block markup:", error);
      return createFallbackMarkup(paragraphs);
    }
  }

  // Большой документ — разбиваем на чанки
  console.log(
    `[block-markup] Large document: ${paragraphs.length} paragraphs, splitting into chunks of ${CHUNK_SIZE}`
  );

  const allBlocks: BlockMarkupItem[] = [];
  const allWarnings: string[] = [];
  let failedChunks = 0;

  const chunks: Array<{ index: number; text: string; style?: string }>[] = [];
  for (let i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
    chunks.push(paragraphs.slice(i, i + CHUNK_SIZE));
  }

  // Обрабатываем чанки последовательно (чтобы не исчерпать rate limits)
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    try {
      const result = await parseChunk(chunk);
      allBlocks.push(...result.blocks);
      if (result.warnings) {
        allWarnings.push(...result.warnings);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[block-markup] Chunk ${ci + 1}/${chunks.length} failed: ${msg}`
      );
      failedChunks++;
      // Fallback для этого чанка — остальные чанки продолжаем
      const fallback = createFallbackMarkup(chunk);
      allBlocks.push(...fallback.blocks);
      allWarnings.push(
        `Чанк ${ci + 1}/${chunks.length} (параграфы ${chunk[0].index}-${chunk[chunk.length - 1].index}) — fallback`
      );
    }
  }

  console.log(
    `[block-markup] Done: ${chunks.length} chunks, ${failedChunks} failed, ${allBlocks.length} blocks total`
  );

  return {
    blocks: allBlocks,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}
