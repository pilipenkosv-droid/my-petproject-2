/**
 * AI-разметка блоков документа через AI Gateway
 *
 * Определяет тип каждого параграфа (заголовок, текст, библиография и т.д.)
 * Большие документы автоматически разбиваются на чанки.
 */

import { callAI } from "./gateway";
import { recordUsage } from "./rate-limiter";
import {
  DocumentBlockMarkup,
  documentBlockMarkupSchema,
  BlockMarkupItem,
} from "./block-markup-schemas";
import {
  BLOCK_MARKUP_SYSTEM_PROMPT,
  createBlockMarkupPrompt,
} from "./block-markup-prompts";

import type { BlockType } from "./block-markup-schemas";

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
): Promise<DocumentBlockMarkup & { modelId?: string }> {
  const response = await callAI({
    systemPrompt: BLOCK_MARKUP_SYSTEM_PROMPT,
    userPrompt: createBlockMarkupPrompt(paragraphs),
    temperature: 0.1,
  });

  const parsed = documentBlockMarkupSchema.parse(response.json);
  console.log(
    `[block-markup] Chunk (${paragraphs.length} paragraphs) parsed via ${response.modelName}`
  );
  return { ...parsed, modelId: response.modelId };
}

/**
 * Post-processing валидация: исправляет очевидные ошибки AI-разметки rule-based логикой.
 * Не использует AI — работает моментально и бесплатно.
 */
function validateAndFixMarkup(
  blocks: BlockMarkupItem[],
  paragraphs: Array<{ index: number; text: string; style?: string }>
): { blocks: BlockMarkupItem[]; fixes: string[] } {
  const textMap = new Map(paragraphs.map((p) => [p.index, p]));
  const fixes: string[] = [];

  const fixed = blocks.map((block) => {
    const para = textMap.get(block.paragraphIndex);
    if (!para) return block;

    const text = para.text.trim();
    const style = para.style?.toLowerCase() ?? "";
    let correctedType: BlockType | null = null;

    // 1. Пустой параграф должен быть empty
    if (text === "" && block.blockType !== "empty") {
      correctedType = "empty";
    }

    // 2. Параграф с только числом (1-4 цифры) → page_number
    if (/^\d{1,4}$/.test(text) && block.blockType !== "page_number" && block.blockType !== "toc_entry") {
      correctedType = "page_number";
    }

    // 3. "Рисунок N" → figure_caption, не body_text
    if (/^Рисунок\s+\d|^Рис\.\s*\d/i.test(text) && block.blockType === "body_text") {
      correctedType = "figure_caption";
    }

    // 4. "Таблица N" → table_caption, не body_text
    if (/^Таблица\s+\d|^Табл\.\s*\d/i.test(text) && block.blockType === "body_text") {
      correctedType = "table_caption";
    }

    // 5. Heading стиль в Word → заголовок, не body_text
    if (style.startsWith("heading") && block.blockType === "body_text") {
      const level = parseInt(style.replace(/\D/g, ""), 10);
      if (level >= 1 && level <= 4) {
        correctedType = `heading_${level}` as BlockType;
      }
    }

    // 6. Списочный маркер → list_item
    if (/^[–\-•*]\s/.test(text) && block.blockType === "body_text") {
      correctedType = "list_item";
    }
    if (/^[а-яa-z]\)\s|^\d+\)\s/i.test(text) && block.blockType === "body_text") {
      correctedType = "list_item";
    }

    // 7. title_page → подтипы (если AI вернул generic title_page, уточняем)
    if (block.blockType === "title_page") {
      // Аннотации в скобках: "(подпись)", "(ФИО)", "(дата)", "(учёная степень, звание)"
      if (/^\(.*\)$/.test(text)) {
        correctedType = "title_page_annotation";
      }
      // Город и год в конце титульной: "Москва 2026", "г. Санкт-Петербург 2025"
      else if (/^(?:г\.\s*)?[А-ЯЁ][а-яё\-]+\s+\d{4}\s*$/.test(text)) {
        correctedType = "title_page_footer";
      }
    }

    // 8. bibliography_entry без metadata.language → добавляем
    if (block.blockType === "bibliography_entry" && !block.metadata?.language) {
      const isEnglish = /[a-zA-Z]{3,}/.test(text) && !/[а-яА-Я]{3,}/.test(text);
      return {
        ...block,
        metadata: { ...block.metadata, language: isEnglish ? "en" as const : "ru" as const },
      };
    }

    if (correctedType) {
      fixes.push(`[${block.paragraphIndex}] ${block.blockType} → ${correctedType}`);
      return { ...block, blockType: correctedType, confidence: 0.8 };
    }

    return block;
  });

  return { blocks: fixed, fixes };
}

/**
 * Размечает параграфы документа по типам блоков через AI.
 * Документы с >CHUNK_SIZE параграфов разбиваются на чанки и обрабатываются последовательно.
 */
export async function parseDocumentBlocks(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Promise<DocumentBlockMarkup & { modelId?: string }> {
  if (paragraphs.length === 0) {
    return { blocks: [], warnings: [] };
  }

  // Маленький документ — один запрос
  if (paragraphs.length <= CHUNK_SIZE) {
    try {
      const result = await parseChunk(paragraphs);
      const { blocks: validated, fixes } = validateAndFixMarkup(result.blocks, paragraphs);
      if (fixes.length > 0) {
        console.log(`[block-markup] Post-validation fixed ${fixes.length} blocks: ${fixes.join(", ")}`);
      }
      return { ...result, blocks: validated };
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
  let primaryModelId: string | undefined;

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
      if (!primaryModelId && result.modelId) {
        primaryModelId = result.modelId;
      }
      if (result.warnings) {
        allWarnings.push(...result.warnings);
      }
      // Сбрасываем ошибки после успешного чанка (чтобы следующий чанк мог использовать модель)
      if (result.modelId) {
        await recordUsage(result.modelId);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[block-markup] Chunk ${ci + 1}/${chunks.length} failed: ${msg}`
      );
      failedChunks++;
      // Сбрасываем rate-limiter после ошибки чанка — следующий чанк получит шанс
      if (primaryModelId) {
        await recordUsage(primaryModelId);
      }
      // Fallback для этого чанка — остальные чанки продолжаем
      const fallback = createFallbackMarkup(chunk);
      allBlocks.push(...fallback.blocks);
      allWarnings.push(
        `Чанк ${ci + 1}/${chunks.length} (параграфы ${chunk[0].index}-${chunk[chunk.length - 1].index}) — fallback`
      );
    }
  }

  // Post-validation: исправляем очевидные ошибки AI rule-based логикой
  const { blocks: validated, fixes } = validateAndFixMarkup(allBlocks, paragraphs);
  if (fixes.length > 0) {
    console.log(`[block-markup] Post-validation fixed ${fixes.length} blocks: ${fixes.join(", ")}`);
  }

  console.log(
    `[block-markup] Done: ${chunks.length} chunks, ${failedChunks} failed, ${validated.length} blocks total`
  );

  return {
    blocks: validated,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    modelId: primaryModelId,
  };
}
