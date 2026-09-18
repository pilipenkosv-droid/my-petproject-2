/**
 * Один запрос AI-разметки на чанк параграфов, с рекурсивным сплитом при ошибке.
 * Выделено из document-block-classify-ai.ts, чтобы файлы оставались ≤300 строк.
 */

import { callAI } from "./gateway";
import { DocumentBlockMarkup, documentBlockMarkupSchema } from "./block-markup-schemas";
import {
  BLOCK_MARKUP_SYSTEM_PROMPT,
  createBlockMarkupPrompt,
} from "./block-markup-prompts";
import { normalizeAiResponse } from "./block-markup-rules";
import type { ChunkContext } from "./document-block-classify-ai";

const MIN_RETRY_CHUNK = 10;

/** Размечает один чанк параграфов через AI с рекурсивным retry. */
export async function parseChunk(
  paragraphs: Array<{ index: number; text: string; style?: string }>,
  context?: ChunkContext,
  depth = 0,
  deadline?: number
): Promise<DocumentBlockMarkup & { modelId?: string }> {
  try {
    const response = await callAI({
      systemPrompt: BLOCK_MARKUP_SYSTEM_PROMPT,
      userPrompt: createBlockMarkupPrompt(paragraphs, context),
      temperature: 0.1,
      maxTokens: 4096,
      thinking: false, // разметка блоков — извлечение, не рассуждение
      deadline,
    });

    const normalized = normalizeAiResponse(response.json);
    const parsed = documentBlockMarkupSchema.parse(normalized);
    console.log(
      `[block-markup] Chunk (${paragraphs.length} paragraphs${depth > 0 ? `, retry depth ${depth}` : ""}) parsed via ${response.modelName}`
    );
    return { ...parsed, modelId: response.modelId };
  } catch (error) {
    // Rate limit / all models unavailable → не пытаемся split, сразу пробрасываем
    const errMsg = error instanceof Error ? error.message : String(error);
    if (
      errMsg.includes("лимит исчерпан") ||
      errMsg.includes("недоступны") ||
      errMsg.includes("timeout") ||
      errMsg.includes("Бюджет AI-запроса исчерпан")
    ) {
      throw error;
    }

    if (paragraphs.length <= MIN_RETRY_CHUNK || depth >= 2) throw error;

    const mid = Math.floor(paragraphs.length / 2);
    const firstHalf = paragraphs.slice(0, mid);
    const secondHalf = paragraphs.slice(mid);

    console.log(
      `[block-markup] Chunk (${paragraphs.length} paragraphs) failed, splitting → ${firstHalf.length} + ${secondHalf.length}`
    );

    const secondContext: ChunkContext = { sectionHeading: context?.sectionHeading };

    await new Promise((r) => setTimeout(r, 500 * (depth + 1)));
    const result1 = await parseChunk(firstHalf, context, depth + 1, deadline);
    await new Promise((r) => setTimeout(r, 300));
    const result2 = await parseChunk(secondHalf, secondContext, depth + 1, deadline);

    return {
      blocks: [...result1.blocks, ...result2.blocks],
      warnings: [...(result1.warnings || []), ...(result2.warnings || [])],
      modelId: result1.modelId || result2.modelId,
    };
  }
}
