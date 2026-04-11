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

/** Целевой размер чанка (параграфов). Структурный чанкинг может дать ±20%. */
const TARGET_CHUNK_SIZE = 50;
/** Жёсткий максимум — если структурная граница не найдена, режем тут */
const MAX_CHUNK_SIZE = 70;
/** Минимум — не создавать слишком мелкие чанки */
const MIN_CHUNK_SIZE = 15;

/** Паттерны структурных границ документа — хорошие места для разрезания */
const SECTION_BOUNDARY_RE =
  /^(?:введение|заключение|глава\s+\d|список\s+(?:использованных?\s+)?(?:источников|литературы)|библиограф|приложение\s+[а-яА-Яa-zA-Z]|содержание|оглавление|аннотация|abstract|список\s+сокращений)\s*$/i;

/**
 * Структурный чанкинг: режет по смысловым границам документа.
 *
 * Приоритет границ (от лучшей к худшей):
 * 1. Заголовок секции (Введение, Глава, Список литературы, Приложение)
 * 2. Word Heading стиль (Heading1, Heading2, ...)
 * 3. Пустой параграф после блока текста
 * 4. Жёсткий лимит MAX_CHUNK_SIZE
 */
function splitIntoStructuralChunks(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Array<Array<{ index: number; text: string; style?: string }>> {
  if (paragraphs.length <= MAX_CHUNK_SIZE) {
    return [paragraphs];
  }

  const chunks: Array<Array<{ index: number; text: string; style?: string }>> = [];
  let start = 0;

  while (start < paragraphs.length) {
    const remaining = paragraphs.length - start;

    // Остаток помещается в один чанк
    if (remaining <= MAX_CHUNK_SIZE) {
      chunks.push(paragraphs.slice(start));
      break;
    }

    // Ищем лучшую границу в диапазоне [TARGET..MAX]
    let bestCut = -1;
    let bestScore = 0;

    for (let i = start + MIN_CHUNK_SIZE; i < start + MAX_CHUNK_SIZE && i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const text = p.text.trim();
      const style = (p.style || "").toLowerCase();
      let score = 0;

      // Секция документа (Введение, Заключение, Приложение...)
      if (SECTION_BOUNDARY_RE.test(text)) {
        score = 100;
      }
      // Heading стиль в Word
      else if (style.startsWith("heading")) {
        score = 80;
      }
      // Нумерованный заголовок ("1.2 Название")
      else if (/^\d+\.\d*\s+[А-ЯЁA-Z]/.test(text)) {
        score = 70;
      }
      // Пустой параграф — естественный разделитель
      else if (text === "") {
        score = 30;
      }

      // Бонус за близость к TARGET_CHUNK_SIZE (±5 — идеально)
      const dist = Math.abs((i - start) - TARGET_CHUNK_SIZE);
      if (dist <= 5) score += 10;

      if (score > bestScore) {
        bestScore = score;
        bestCut = i;
      }
    }

    // Если хорошая граница не найдена — режем на TARGET_CHUNK_SIZE
    if (bestCut <= start) {
      bestCut = start + TARGET_CHUNK_SIZE;
    }

    chunks.push(paragraphs.slice(start, bestCut));
    start = bestCut;
  }

  return chunks;
}

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
    maxTokens: 4096,
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

    // 4. "Таблица N" / "Таблица №N" → table_caption, не body_text
    if (/^Таблица\s+(?:№\s*)?\d|^Табл\.\s*(?:№\s*)?\d/i.test(text) && block.blockType === "body_text") {
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
  if (paragraphs.length <= MAX_CHUNK_SIZE) {
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

  // Большой документ — структурный чанкинг по границам секций
  const chunks = splitIntoStructuralChunks(paragraphs);
  console.log(
    `[block-markup] Large document: ${paragraphs.length} paragraphs → ${chunks.length} structural chunks (${chunks.map(c => c.length).join(", ")} paragraphs)`
  );

  const allBlocks: BlockMarkupItem[] = [];
  const allWarnings: string[] = [];
  let failedChunks = 0;
  let primaryModelId: string | undefined;

  // Обрабатываем чанки батчами по PARALLEL_BATCH — баланс скорости и rate limits
  const PARALLEL_BATCH = 3;
  for (let bi = 0; bi < chunks.length; bi += PARALLEL_BATCH) {
    const batch = chunks.slice(bi, bi + PARALLEL_BATCH);
    const batchResults = await Promise.allSettled(
      batch.map((chunk, offset) => {
        const ci = bi + offset;
        return parseChunk(chunk).then(result => ({ ci, chunk, result }));
      })
    );

    for (const settled of batchResults) {
      if (settled.status === "fulfilled") {
        const { ci, result } = settled.value;
        allBlocks.push(...result.blocks);
        if (!primaryModelId && result.modelId) {
          primaryModelId = result.modelId;
        }
        if (result.warnings) {
          allWarnings.push(...result.warnings);
        }
        if (result.modelId) {
          await recordUsage(result.modelId);
        }
      } else {
        const ci = bi + batchResults.indexOf(settled);
        const chunk = chunks[ci];
        const msg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        console.error(
          `[block-markup] Chunk ${ci + 1}/${chunks.length} failed: ${msg}`
        );
        failedChunks++;
        if (chunk) {
          const fallback = createFallbackMarkup(chunk);
          allBlocks.push(...fallback.blocks);
          allWarnings.push(
            `Чанк ${ci + 1}/${chunks.length} (параграфы ${chunk[0].index}-${chunk[chunk.length - 1].index}) — fallback`
          );
        }
      }
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
