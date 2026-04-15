/**
 * AI-разметка блоков документа через AI Gateway
 *
 * Гибридный пайплайн: rule-based пре-классификация (T0) + AI для неоднозначных параграфов.
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
import {
  classifyByRule,
  normalizeAiResponse,
  postValidateMarkup,
  sequenceValidateBlocks,
  classifyTitlePageBlocks,
} from "./block-markup-rules";
import { verifyMarkupStructure, reclassifyBlocks } from "./markup-verifier";
import { parseDocumentSemantics, getSectionByType } from "./document-semantic-parser";

/** Целевой размер чанка (параграфов). Структурный чанкинг может дать ±20%. */
const TARGET_CHUNK_SIZE = 50;
const MAX_CHUNK_SIZE = 70;
const MIN_CHUNK_SIZE = 15;

/** Паттерны структурных границ документа */
const SECTION_BOUNDARY_RE =
  /^(?:введение|заключение|глава\s+\d|список\s+(?:использованных?\s+)?(?:источников|литературы)|библиограф|приложение\s+[а-яА-Яa-zA-Z]|содержание|оглавление|аннотация|abstract|список\s+сокращений)\s*$/i;

/** Структурный чанкинг: режет по смысловым границам документа. */
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
    if (remaining <= MAX_CHUNK_SIZE) {
      chunks.push(paragraphs.slice(start));
      break;
    }

    let bestCut = -1;
    let bestScore = 0;

    for (let i = start + MIN_CHUNK_SIZE; i < start + MAX_CHUNK_SIZE && i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const text = p.text.trim();
      const style = (p.style || "").toLowerCase();
      let score = 0;

      if (SECTION_BOUNDARY_RE.test(text)) score = 100;
      else if (style.startsWith("heading")) score = 80;
      else if (/^\d+\.\d*\s+[А-ЯЁA-Z]/.test(text)) score = 70;
      else if (text === "") score = 30;

      const dist = Math.abs((i - start) - TARGET_CHUNK_SIZE);
      if (dist <= 5) score += 10;

      if (score > bestScore) {
        bestScore = score;
        bestCut = i;
      }
    }

    if (bestCut <= start) bestCut = start + TARGET_CHUNK_SIZE;
    chunks.push(paragraphs.slice(start, bestCut));
    start = bestCut;
  }

  return chunks;
}

/** Создаёт fallback-разметку при ошибке AI */
function createFallbackMarkup(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): DocumentBlockMarkup {
  return {
    blocks: paragraphs.map((p) => ({
      paragraphIndex: p.index,
      blockType: p.text.trim() === "" ? ("empty" as const) : ("unknown" as const),
      confidence: 0,
    })),
    warnings: ["AI-разметка не удалась, используется fallback с типом unknown"],
  };
}

interface ChunkContext {
  sectionHeading?: string;
  overlapParagraphs?: Array<{ index: number; text: string; blockType?: string }>;
}

const MIN_RETRY_CHUNK = 10;

/** Размечает один чанк параграфов через AI с рекурсивным retry. */
async function parseChunk(
  paragraphs: Array<{ index: number; text: string; style?: string }>,
  context?: ChunkContext,
  depth = 0
): Promise<DocumentBlockMarkup & { modelId?: string }> {
  try {
    const response = await callAI({
      systemPrompt: BLOCK_MARKUP_SYSTEM_PROMPT,
      userPrompt: createBlockMarkupPrompt(paragraphs, context),
      temperature: 0.1,
      maxTokens: 4096,
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
    if (errMsg.includes("лимит исчерпан") || errMsg.includes("недоступны") || errMsg.includes("timeout")) {
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
    const result1 = await parseChunk(firstHalf, context, depth + 1);
    await new Promise((r) => setTimeout(r, 300));
    const result2 = await parseChunk(secondHalf, secondContext, depth + 1);

    return {
      blocks: [...result1.blocks, ...result2.blocks],
      warnings: [...(result1.warnings || []), ...(result2.warnings || [])],
      modelId: result1.modelId || result2.modelId,
    };
  }
}

/**
 * Rule-based пре-классификация: выделяет параграфы, не требующие AI.
 * Возвращает pre-classified блоки и оставшиеся параграфы для AI.
 */
function preClassifyParagraphs(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): {
  preClassified: BlockMarkupItem[];
  needsAI: Array<{ index: number; text: string; style?: string }>;
} {
  const preClassified: BlockMarkupItem[] = [];
  const needsAI: Array<{ index: number; text: string; style?: string }> = [];

  for (const p of paragraphs) {
    const result = classifyByRule(p);
    if (result) {
      preClassified.push({
        paragraphIndex: p.index,
        blockType: result.blockType,
        confidence: result.confidence,
        metadata: result.metadata,
      });
    } else {
      needsAI.push(p);
    }
  }

  return { preClassified, needsAI };
}

/**
 * Размечает параграфы документа: rule-based (T0) + AI для неоднозначных.
 */
export async function parseDocumentBlocks(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Promise<DocumentBlockMarkup & { modelId?: string; durationMs?: number; preClassifiedCount?: number }> {
  const startTime = Date.now();

  if (paragraphs.length === 0) {
    return { blocks: [], warnings: [], durationMs: 0, preClassifiedCount: 0 };
  }

  const allWarnings: string[] = [];

  // Шаг 0: Семантический предпроход (определяет секции документа)
  let semanticBibRange: { start: number; end: number } | null = null;
  if (paragraphs.length > 30) {
    try {
      const semantics = await parseDocumentSemantics(
        paragraphs.map((p) => ({ index: p.index, text: p.text.slice(0, 150) }))
      );
      const bibSection = getSectionByType(semantics, "bibliography");
      if (bibSection) {
        semanticBibRange = { start: bibSection.startParagraph, end: bibSection.endParagraph };
        console.log(
          `[block-markup] Semantic pre-pass: bibliography at paragraphs ${semanticBibRange.start}-${semanticBibRange.end}`
        );
      }
      if (semantics.warnings) allWarnings.push(...semantics.warnings);
    } catch (error) {
      console.warn("[block-markup] Semantic pre-pass failed, continuing without:", error);
    }
  }

  // Шаг 1: Rule-based пре-классификация (T0)
  const { preClassified, needsAI } = preClassifyParagraphs(paragraphs);
  const preClassifiedPct = Math.round((preClassified.length / paragraphs.length) * 100);
  console.log(
    `[block-markup] Pre-classified ${preClassified.length}/${paragraphs.length} paragraphs (${preClassifiedPct}%) by rules`
  );

  // Шаг 2: AI-разметка оставшихся параграфов
  let aiBlocks: BlockMarkupItem[] = [];
  let modelId: string | undefined;

  if (needsAI.length > 0) {
    const aiResult = await classifyWithAI(needsAI, preClassified, paragraphs, semanticBibRange);
    aiBlocks = aiResult.blocks;
    modelId = aiResult.modelId;
    if (aiResult.warnings) allWarnings.push(...aiResult.warnings);
  }

  // Шаг 3: Объединяем pre-classified + AI, сортируем по paragraphIndex
  const allBlocks = [...preClassified, ...aiBlocks]
    .sort((a, b) => a.paragraphIndex - b.paragraphIndex);

  // Шаг 4: Post-validation (safety net)
  const { blocks: postValidated, fixes: postFixes } = postValidateMarkup(allBlocks, paragraphs);
  if (postFixes.length > 0) {
    console.log(`[block-markup] Post-validation fixed ${postFixes.length} blocks: ${postFixes.join(", ")}`);
  }

  // Шаг 5: Sequence validation (контекст последовательности)
  const { blocks: seqValidated, fixes: seqFixes } = sequenceValidateBlocks(postValidated, paragraphs);
  if (seqFixes.length > 0) {
    console.log(`[block-markup] Sequence validation fixed ${seqFixes.length} blocks: ${seqFixes.join(", ")}`);
  }

  // Шаг 5.5: Title page detection (позиционная эвристика)
  const { blocks: titlePageValidated, fixes: titlePageFixes } = classifyTitlePageBlocks(seqValidated, paragraphs);
  if (titlePageFixes.length > 0) {
    console.log(`[block-markup] Title page detection: ${titlePageFixes.length} blocks: ${titlePageFixes.join(", ")}`);
  }

  // Шаг 6: Структурная верификация + feedback loop
  let finalBlocks = titlePageValidated;
  const issues = verifyMarkupStructure(finalBlocks, paragraphs);
  if (issues.length > 0) {
    console.log(`[block-markup] Structural issues: ${issues.map((i) => `${i.type}(${i.severity})`).join(", ")}`);

    // Feedback loop: переклассификация unknown блоков при unknownPct > 5%
    const unknownIssue = issues.find((i) => i.type === "high_unknown_rate");
    if (unknownIssue?.affectedIndices && unknownIssue.affectedIndices.length > 0) {
      const { reclassified, count } = await reclassifyBlocks(
        unknownIssue.affectedIndices, finalBlocks, paragraphs
      );
      if (count > 0) {
        finalBlocks = reclassified;
        allWarnings.push(`Reclassified ${count} unknown blocks via feedback loop`);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[block-markup] Completed in ${(durationMs / 1000).toFixed(1)}s`);

  return {
    blocks: finalBlocks,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    modelId,
    durationMs,
    preClassifiedCount: preClassified.length,
  };
}

/**
 * AI-классификация параграфов с чанкингом.
 * Pre-classified блоки используются как контекст в overlap.
 */
async function classifyWithAI(
  needsAI: Array<{ index: number; text: string; style?: string }>,
  preClassified: BlockMarkupItem[],
  allParagraphs: Array<{ index: number; text: string; style?: string }>,
  semanticBibRange?: { start: number; end: number } | null
): Promise<DocumentBlockMarkup & { modelId?: string }> {
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
      const result = await parseChunk(needsAI, context);
      return result;
    } catch (error) {
      console.error("Error in AI block markup:", error);
      return createFallbackMarkup(needsAI);
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

  for (let bi = 0; bi < chunks.length; bi += PARALLEL_BATCH) {
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
        return parseChunk(chunk, chunkContexts[ci]).then(result => ({ ci, chunk, result }));
      })
    );

    for (const settled of batchResults) {
      if (settled.status === "fulfilled") {
        const { result } = settled.value;
        allBlocks.push(...result.blocks);
        if (!primaryModelId && result.modelId) primaryModelId = result.modelId;
        if (result.warnings) allWarnings.push(...result.warnings);
        if (result.modelId) await recordUsage(result.modelId);
      } else {
        const ci = bi + batchResults.indexOf(settled);
        const chunk = chunks[ci];
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
