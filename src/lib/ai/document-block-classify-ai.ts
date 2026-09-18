/**
 * AI-классификация блоков документа: чанкинг, батчинг и запросы к AI Gateway.
 *
 * Выделено из document-block-markup.ts — там остался только оркестратор
 * разметки (pre-классификация правилами, валидации, безопасные фоллбэки).
 */

import { recordUsage } from "./rate-limiter";
import { DocumentBlockMarkup, BlockMarkupItem } from "./block-markup-schemas";
import { parseChunk } from "./document-block-parse-chunk";
import { BUDGET_EXPIRED, raceDeadline, ruleBasedMarkupFor } from "./markup-budget";
import {
  MAX_CHUNK_SIZE,
  SECTION_BOUNDARY_RE,
  createFallbackMarkup,
  splitIntoStructuralChunks,
} from "./document-block-chunking";

export interface ChunkContext {
  sectionHeading?: string;
  overlapParagraphs?: Array<{ index: number; text: string; blockType?: string }>;
}

/**
 * AI-классификация параграфов с чанкингом.
 * Pre-classified блоки используются как контекст в overlap.
 */
export async function classifyWithAI(
  needsAI: Array<{ index: number; text: string; style?: string }>,
  preClassified: BlockMarkupItem[],
  allParagraphs: Array<{ index: number; text: string; style?: string }>,
  semanticBibRange: { start: number; end: number } | null | undefined,
  deadline: number
): Promise<DocumentBlockMarkup & { modelId?: string; degradedChunks: number }> {
  const paraMap = new Map(allParagraphs.map(p => [p.index, p]));
  const preClassifiedMap = new Map(preClassified.map(b => [b.paragraphIndex, b]));

  // Маленький набор — один запрос
  if (needsAI.length <= MAX_CHUNK_SIZE) {
    try {
      let context = buildContextFromPreClassified(needsAI, preClassifiedMap, paraMap);
      // Обогащаем контекст семантикой
      if (semanticBibRange) {
        const firstIdx = needsAI[0].index;
        const lastIdx = needsAI[needsAI.length - 1].index;
        if (lastIdx >= semanticBibRange.start && firstIdx <= semanticBibRange.end) {
          if (!context) context = {};
          context.sectionHeading = (context.sectionHeading || "") +
            ` [СЕМАНТИКА: библиография в параграфах ${semanticBibRange.start}-${semanticBibRange.end}]`;
        }
      }
      const result = await raceDeadline(parseChunk(needsAI, context, 0, deadline), deadline);
      if (result === BUDGET_EXPIRED) {
        console.warn(
          `[block-markup] Budget exhausted, ${needsAI.length} paragraphs classified rule-based`
        );
        return {
          blocks: ruleBasedMarkupFor(needsAI),
          warnings: [`Разметка прервана по бюджету времени, ${needsAI.length} параграфов размечены по правилам`],
          degradedChunks: 1,
        };
      }
      return { ...result, degradedChunks: 0 };
    } catch (error) {
      console.error("Error in AI block markup:", error);
      return { ...createFallbackMarkup(needsAI), degradedChunks: 0 };
    }
  }

  // Большой набор — структурный чанкинг
  const chunks = splitIntoStructuralChunks(needsAI);
  console.log(
    `[block-markup] AI portion: ${needsAI.length} paragraphs → ${chunks.length} chunks (${chunks.map(c => c.length).join(", ")})`
  );

  // Предвычисляем заголовки секций
  const sectionHeadings = new Map<number, string>();
  let currentHeading = "";
  for (const p of allParagraphs) {
    const text = p.text.trim();
    const style = (p.style || "").toLowerCase();
    if (style.startsWith("heading") || SECTION_BOUNDARY_RE.test(text) ||
        /^\d+\.\d*\s+[А-ЯЁA-Z]/.test(text)) {
      currentHeading = text.slice(0, 100);
    }
    if (currentHeading) sectionHeadings.set(p.index, currentHeading);
  }

  const chunkContexts: ChunkContext[] = chunks.map((chunk) => {
    const ctx: ChunkContext = {};
    const firstIdx = chunk[0].index;
    const lastIdx = chunk[chunk.length - 1].index;

    // Heading контекст
    if (firstIdx > 0) {
      for (let i = firstIdx - 1; i >= 0; i--) {
        const h = sectionHeadings.get(i);
        if (h) { ctx.sectionHeading = h; break; }
      }
    }

    // Обогащение контекста из семантического предпрохода
    if (semanticBibRange &&
        lastIdx >= semanticBibRange.start && firstIdx <= semanticBibRange.end) {
      ctx.sectionHeading = (ctx.sectionHeading || "") +
        ` [СЕМАНТИКА: этот чанк содержит записи библиографии (параграфы ${semanticBibRange.start}-${semanticBibRange.end})]`;
    }

    return ctx;
  });

  const allBlocks: BlockMarkupItem[] = [];
  const allWarnings: string[] = [];
  let failedChunks = 0;
  let primaryModelId: string | undefined;

  const PARALLEL_BATCH = 3;
  const OVERLAP_SIZE = 5;

  let degradedChunks = 0;

  for (let bi = 0; bi < chunks.length; bi += PARALLEL_BATCH) {
    // Бюджет исчерпан — оставшиеся чанки не начинаем, размечаем по правилам.
    if (Date.now() >= deadline) {
      for (let ci = bi; ci < chunks.length; ci++) {
        allBlocks.push(...ruleBasedMarkupFor(chunks[ci]));
        degradedChunks++;
      }
      console.warn(
        `[block-markup] Budget exhausted, ${degradedChunks} remaining chunks classified rule-based`
      );
      allWarnings.push(
        `Разметка прервана по бюджету времени, ${degradedChunks} чанков размечены по правилам`
      );
      break;
    }

    const batch = chunks.slice(bi, bi + PARALLEL_BATCH);

    // Overlap из уже обработанных блоков + pre-classified
    for (let offset = 0; offset < batch.length; offset++) {
      const ci = bi + offset;
      const firstIdx = batch[offset][0].index;

      // Собираем overlap: ближайшие pre-classified + уже обработанные AI блоки
      const overlapBlocks: Array<{ index: number; text: string; blockType?: string }> = [];

      // Pre-classified соседи перед чанком
      for (let idx = firstIdx - 1; idx >= Math.max(0, firstIdx - OVERLAP_SIZE); idx--) {
        const pre = preClassifiedMap.get(idx);
        if (pre) {
          overlapBlocks.unshift({
            index: pre.paragraphIndex,
            text: (paraMap.get(pre.paragraphIndex)?.text || "").slice(0, 100),
            blockType: pre.blockType,
          });
        }
      }

      // Уже обработанные AI блоки
      if (allBlocks.length > 0 && ci > 0) {
        const lastBlocks = allBlocks.slice(-OVERLAP_SIZE);
        for (const b of lastBlocks) {
          overlapBlocks.push({
            index: b.paragraphIndex,
            text: (paraMap.get(b.paragraphIndex)?.text || "").slice(0, 100),
            blockType: b.blockType,
          });
        }
      }

      if (overlapBlocks.length > 0) {
        chunkContexts[ci].overlapParagraphs = overlapBlocks.slice(-OVERLAP_SIZE);
      }
    }

    const batchResults = await Promise.allSettled(
      batch.map((chunk, offset) => {
        const ci = bi + offset;
        return raceDeadline(parseChunk(chunk, chunkContexts[ci], 0, deadline), deadline);
      })
    );

    for (let offset = 0; offset < batchResults.length; offset++) {
      const settled = batchResults[offset];
      const ci = bi + offset;
      const chunk = chunks[ci];

      if (settled.status === "fulfilled" && settled.value !== BUDGET_EXPIRED) {
        const result = settled.value;
        allBlocks.push(...result.blocks);
        if (!primaryModelId && result.modelId) primaryModelId = result.modelId;
        if (result.warnings) allWarnings.push(...result.warnings);
        if (result.modelId) await recordUsage(result.modelId);
      } else if (settled.status === "fulfilled") {
        // Бюджет истёк, пока чанк был в работе — ответ не ждём.
        console.warn(`[block-markup] Chunk ${ci + 1}/${chunks.length} cut by budget, rule-based`);
        allBlocks.push(...ruleBasedMarkupFor(chunk));
        degradedChunks++;
        allWarnings.push(
          `Чанк ${ci + 1}/${chunks.length} прерван по бюджету времени — разметка по правилам`
        );
      } else {
        const msg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        console.error(`[block-markup] Chunk ${ci + 1}/${chunks.length} failed: ${msg}`);
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

  if (failedChunks > 0) {
    console.log(`[block-markup] AI done: ${chunks.length} chunks, ${failedChunks} failed`);
  }

  return {
    blocks: allBlocks,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    modelId: primaryModelId,
    degradedChunks,
  };
}

/** Строит контекст из pre-classified соседей для маленького документа */
function buildContextFromPreClassified(
  needsAI: Array<{ index: number; text: string; style?: string }>,
  preClassifiedMap: Map<number, BlockMarkupItem>,
  paraMap: Map<number, { index: number; text: string; style?: string }>
): ChunkContext | undefined {
  if (needsAI.length === 0) return undefined;
  const firstIdx = needsAI[0].index;
  const overlap: Array<{ index: number; text: string; blockType?: string }> = [];

  for (let idx = firstIdx - 1; idx >= Math.max(0, firstIdx - 5); idx--) {
    const pre = preClassifiedMap.get(idx);
    if (pre) {
      overlap.unshift({
        index: pre.paragraphIndex,
        text: (paraMap.get(pre.paragraphIndex)?.text || "").slice(0, 100),
        blockType: pre.blockType,
      });
    }
  }

  return overlap.length > 0 ? { overlapParagraphs: overlap } : undefined;
}
