/**
 * Структурная верификация AI-разметки блоков + точечная переклассификация.
 *
 * Проверяет целостность разметки после AI + rule-based валидации:
 * - bibliography_title без entries
 * - heading_2 без heading_1
 * - высокий % unknown
 * - heading с текстом >200 символов
 *
 * При обнаружении критических проблем — точечная переклассификация через AI.
 */

import { callAI } from "./gateway";
import { documentBlockMarkupSchema, type BlockMarkupItem } from "./block-markup-schemas";
import { BLOCK_MARKUP_SYSTEM_PROMPT, createBlockMarkupPrompt } from "./block-markup-prompts";
import { normalizeAiResponse } from "./block-markup-rules";

export interface StructuralIssue {
  type: "missing_bibliography_entries" | "orphan_heading_2" | "high_unknown_rate" | "long_heading";
  severity: "critical" | "major" | "minor";
  details: string;
  affectedIndices?: number[];
}

/**
 * Проверяет структурную целостность разметки.
 */
export function verifyMarkupStructure(
  blocks: BlockMarkupItem[],
  paragraphs: Array<{ index: number; text: string; style?: string }>
): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const textMap = new Map(paragraphs.map((p) => [p.index, p]));

  // 1. bibliography_title без bibliography_entry
  const hasBibTitle = blocks.some((b) => b.blockType === "bibliography_title");
  const hasBibEntries = blocks.some((b) => b.blockType === "bibliography_entry");
  if (hasBibTitle && !hasBibEntries) {
    issues.push({
      type: "missing_bibliography_entries",
      severity: "critical",
      details: "bibliography_title найден, но нет ни одного bibliography_entry",
    });
  }

  // 2. heading_2 без heading_1
  const hasH1 = blocks.some((b) => b.blockType === "heading_1");
  const hasH2 = blocks.some((b) => b.blockType === "heading_2");
  if (hasH2 && !hasH1) {
    issues.push({
      type: "orphan_heading_2",
      severity: "major",
      details: "heading_2 найден, но нет heading_1",
    });
  }

  // 3. Высокий % unknown
  const unknownBlocks = blocks.filter((b) => b.blockType === "unknown");
  const unknownPct = blocks.length > 0 ? (unknownBlocks.length / blocks.length) * 100 : 0;
  if (unknownPct > 5) {
    issues.push({
      type: "high_unknown_rate",
      severity: "critical",
      details: `${unknownBlocks.length}/${blocks.length} (${unknownPct.toFixed(1)}%) блоков unknown`,
      affectedIndices: unknownBlocks.map((b) => b.paragraphIndex),
    });
  }

  // 4. heading с текстом >200 символов (скорее body_text)
  const longHeadings = blocks.filter((b) => {
    if (!b.blockType.startsWith("heading_")) return false;
    const text = (textMap.get(b.paragraphIndex)?.text || "").trim();
    return text.length > 200;
  });
  if (longHeadings.length > 0) {
    issues.push({
      type: "long_heading",
      severity: "minor",
      details: `${longHeadings.length} heading(s) длиннее 200 символов`,
      affectedIndices: longHeadings.map((b) => b.paragraphIndex),
    });
  }

  return issues;
}

const RECLASSIFY_CONTEXT_RADIUS = 10;

/**
 * Точечная переклассификация проблемных блоков через AI.
 * Отправляет только unknown/проблемные блоки с расширенным контекстом (±10 параграфов).
 */
export async function reclassifyBlocks(
  affectedIndices: number[],
  allBlocks: BlockMarkupItem[],
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Promise<{ reclassified: BlockMarkupItem[]; count: number }> {
  if (affectedIndices.length === 0) {
    return { reclassified: allBlocks, count: 0 };
  }

  const paraMap = new Map(paragraphs.map((p) => [p.index, p]));
  const blockMap = new Map(allBlocks.map((b) => [b.paragraphIndex, b]));
  const affectedSet = new Set(affectedIndices);

  // Собираем параграфы для переклассификации с контекстом
  const toReclassify: Array<{ index: number; text: string; style?: string }> = [];
  const contextBlocks: Array<{ index: number; text: string; blockType?: string }> = [];

  const minIdx = Math.min(...affectedIndices);
  const maxIdx = Math.max(...affectedIndices);
  const rangeStart = Math.max(0, minIdx - RECLASSIFY_CONTEXT_RADIUS);
  const rangeEnd = maxIdx + RECLASSIFY_CONTEXT_RADIUS;

  for (const p of paragraphs) {
    if (p.index < rangeStart || p.index > rangeEnd) continue;

    if (affectedSet.has(p.index)) {
      toReclassify.push(p);
    } else {
      const existing = blockMap.get(p.index);
      if (existing) {
        contextBlocks.push({
          index: p.index,
          text: p.text.slice(0, 100),
          blockType: existing.blockType,
        });
      }
    }
  }

  if (toReclassify.length === 0) {
    return { reclassified: allBlocks, count: 0 };
  }

  console.log(
    `[markup-verifier] Reclassifying ${toReclassify.length} blocks with ±${RECLASSIFY_CONTEXT_RADIUS} context`
  );

  try {
    const context = {
      overlapParagraphs: contextBlocks.slice(0, 10),
    };

    const response = await callAI({
      systemPrompt: BLOCK_MARKUP_SYSTEM_PROMPT,
      userPrompt: createBlockMarkupPrompt(toReclassify, context),
      temperature: 0.2, // чуть выше для reasoning
      maxTokens: 4096,
    });

    const normalized = normalizeAiResponse(response.json);
    const parsed = documentBlockMarkupSchema.parse(normalized);

    // Merge reclassified blocks back
    const reclassifiedMap = new Map(parsed.blocks.map((b) => [b.paragraphIndex, b]));
    let count = 0;

    const result = allBlocks.map((block) => {
      if (affectedSet.has(block.paragraphIndex)) {
        const newBlock = reclassifiedMap.get(block.paragraphIndex);
        if (newBlock && newBlock.blockType !== "unknown") {
          count++;
          return newBlock;
        }
      }
      return block;
    });

    console.log(
      `[markup-verifier] Reclassified ${count}/${toReclassify.length} blocks successfully`
    );

    return { reclassified: result, count };
  } catch (error) {
    console.error("[markup-verifier] Reclassification failed:", error);
    return { reclassified: allBlocks, count: 0 };
  }
}
