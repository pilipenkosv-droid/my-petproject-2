/**
 * AI-разметка блоков документа через AI Gateway
 *
 * Гибридный пайплайн: rule-based пре-классификация (T0) + AI для неоднозначных параграфов.
 * Чанкинг и сами запросы к AI живут в document-block-classify-ai.ts.
 */

import { DocumentBlockMarkup, BlockMarkupItem } from "./block-markup-schemas";
import {
  classifyByRule,
  postValidateMarkup,
  sequenceValidateBlocks,
  classifyTitlePageBlocks,
} from "./block-markup-rules";
import { verifyMarkupStructure, reclassifyBlocks } from "./markup-verifier";
import { parseDocumentSemantics, getSectionByType } from "./document-semantic-parser";
import { fillUnknownBlocksRuleBased } from "./rule-based-block-classifier";
import { BUDGET_EXPIRED, getMarkupBudgetMs, raceDeadline } from "./markup-budget";
import { classifyWithAI } from "./document-block-classify-ai";

/** Доля бюджета разметки, отдаваемая семантическому предпроходу. */
const PRE_PASS_BUDGET_SHARE = 0.4;

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
  paragraphs: Array<{ index: number; text: string; style?: string }>,
  options: { deadline?: number } = {}
): Promise<DocumentBlockMarkup & {
  modelId?: string;
  durationMs?: number;
  preClassifiedCount?: number;
  ruleBasedFillCount?: number;
  markupDegraded?: boolean;
  markupDegradedChunks?: number;
}> {
  const startTime = Date.now();
  // Дедлайн разметки = что раньше: собственный бюджет стадии или дедлайн всего
  // запроса (роут кладёт туда остаток от лимита функции Vercel).
  const deadline = Math.min(
    options.deadline ?? Number.POSITIVE_INFINITY,
    startTime + getMarkupBudgetMs()
  );
  const budgetMs = deadline - startTime;

  if (paragraphs.length === 0) {
    return {
      blocks: [],
      warnings: [],
      durationMs: 0,
      preClassifiedCount: 0,
      ruleBasedFillCount: 0,
      markupDegraded: false,
      markupDegradedChunks: 0,
    };
  }

  const allWarnings: string[] = [];
  let degradedChunks = 0;

  // Шаг 0: Семантический предпроход (определяет секции документа)
  let semanticBibRange: { start: number; end: number } | null = null;
  if (paragraphs.length > 30) {
    try {
      // Пре-проход — отдельный последовательный round trip. Даём ему только часть
      // бюджета, иначе он один способен съесть весь бюджет основной разметки.
      const prePassDeadline = Math.min(deadline, startTime + Math.floor(budgetMs * PRE_PASS_BUDGET_SHARE));
      const semantics = await raceDeadline(
        parseDocumentSemantics(
          paragraphs.map((p) => ({ index: p.index, text: p.text.slice(0, 150) }))
        ),
        prePassDeadline
      );
      if (semantics === BUDGET_EXPIRED) {
        console.warn("[block-markup] Semantic pre-pass exceeded its budget share, continuing without it");
        allWarnings.push("Семантический предпроход прерван по бюджету времени");
      } else {
        const bibSection = getSectionByType(semantics, "bibliography");
        if (bibSection) {
          semanticBibRange = { start: bibSection.startParagraph, end: bibSection.endParagraph };
          console.log(
            `[block-markup] Semantic pre-pass: bibliography at paragraphs ${semanticBibRange.start}-${semanticBibRange.end}`
          );
        }
        if (semantics.warnings) allWarnings.push(...semantics.warnings);
      }
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
    const aiResult = await classifyWithAI(needsAI, preClassified, paragraphs, semanticBibRange, deadline);
    aiBlocks = aiResult.blocks;
    modelId = aiResult.modelId;
    degradedChunks += aiResult.degradedChunks;
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
      // Ещё один последовательный round trip — только внутри бюджета.
      const outcome = await raceDeadline(
        reclassifyBlocks(unknownIssue.affectedIndices, finalBlocks, paragraphs),
        deadline
      );
      if (outcome === BUDGET_EXPIRED) {
        console.warn("[block-markup] Reclassification skipped: markup budget exhausted");
        allWarnings.push("Переклассификация unknown-блоков пропущена по бюджету времени");
      } else if (outcome.count > 0) {
        finalBlocks = outcome.reclassified;
        allWarnings.push(`Reclassified ${outcome.count} unknown blocks via feedback loop`);
      }
    }
  }

  // Финальный safety-net: rule-based fallback для оставшихся unknown блоков
  const { filled: ruleBasedFillCount } = fillUnknownBlocksRuleBased(finalBlocks, paragraphs);
  if (ruleBasedFillCount > 0) {
    console.log(`[block-markup] Rule-based fallback filled ${ruleBasedFillCount} unknown blocks`);
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[block-markup] Completed in ${(durationMs / 1000).toFixed(1)}s` +
      (degradedChunks > 0 ? ` (degraded: ${degradedChunks} chunks by budget ${budgetMs}ms)` : "")
  );

  return {
    blocks: finalBlocks,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    modelId,
    durationMs,
    preClassifiedCount: preClassified.length,
    ruleBasedFillCount,
    markupDegraded: degradedChunks > 0,
    markupDegradedChunks: degradedChunks,
  };
}
