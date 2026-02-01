/**
 * Семантический анализатор документа через AI Gateway
 *
 * Определяет структуру документа:
 * - Типы секций (введение, главы, заключение, библиография)
 * - Иерархия заголовков
 * - Детальный анализ списка литературы
 */

import { callAI } from "./gateway";
import {
  SemanticStructure,
  semanticStructureSchema,
} from "./semantic-schemas";
import {
  SEMANTIC_ANALYSIS_SYSTEM_PROMPT,
  createSemanticAnalysisPrompt,
} from "./semantic-prompts";

/**
 * Главная функция для семантического анализа документа
 */
export async function parseDocumentSemantics(
  paragraphs: Array<{ index: number; text: string }>
): Promise<SemanticStructure> {
  try {
    const response = await callAI({
      systemPrompt: SEMANTIC_ANALYSIS_SYSTEM_PROMPT,
      userPrompt: createSemanticAnalysisPrompt(paragraphs),
      temperature: 0.1,
    });

    const parsed = semanticStructureSchema.parse(response.json);
    console.log(`[semantic-parser] Parsed via ${response.modelName}`);
    return parsed;
  } catch (error) {
    console.error("Error parsing document semantics:", error);

    return {
      sections: [],
      confidence: 0,
      warnings: [
        `Ошибка при семантическом анализе: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "Будет использована упрощенная эвристика",
      ],
    };
  }
}

/**
 * Вспомогательная функция: получить параграфы из текста документа
 */
export function extractParagraphsFromText(
  text: string
): Array<{ index: number; text: string }> {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return paragraphs.map((text, index) => ({ index, text }));
}

/**
 * Получить секцию по типу
 */
export function getSectionByType(
  structure: SemanticStructure,
  type: string
): SemanticStructure["sections"][number] | undefined {
  return structure.sections.find((s) => s.type === type);
}

/**
 * Проверить, является ли параграф частью секции
 */
export function isParagraphInSection(
  paragraphIndex: number,
  section: { startParagraph: number; endParagraph: number }
): boolean {
  return (
    paragraphIndex >= section.startParagraph &&
    paragraphIndex <= section.endParagraph
  );
}
