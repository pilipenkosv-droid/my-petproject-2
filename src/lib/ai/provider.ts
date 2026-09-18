/**
 * Извлечение правил форматирования из методички через AI Gateway
 */

import { callAI, AIBudgetExceededError } from "./gateway";
import { AIParsingResponse, aiParsingResponseSchema } from "./schemas";
import { RULES_EXTRACTION_SYSTEM_PROMPT, createRulesExtractionPrompt } from "./prompts";
import { DEFAULT_GOST_RULES, FormattingRules } from "@/types/formatting-rules";

/** Потолок ответа: сериализованный DEFAULT_GOST_RULES ≈ 2500 токенов. */
const RULES_MAX_OUTPUT_TOKENS = 6000;

/**
 * Главная функция для парсинга правил форматирования
 */
export async function parseFormattingRules(
  requirementsText: string,
  options: { deadline?: number } = {}
): Promise<AIParsingResponse> {
  try {
    const response = await callAI({
      systemPrompt: RULES_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: createRulesExtractionPrompt(requirementsText),
      temperature: 0.1,
      // Разбор методички — извлечение полей. Размышления здесь давали
      // 2500–10500 reasoning-токенов и 14–49с на вызов (экспорт Gateway 17–18.09).
      thinking: false,
      // Полный JSON правил ≈ 2500 токенов; 6000 — потолок с запасом.
      maxTokens: RULES_MAX_OUTPUT_TOKENS,
      deadline: options.deadline,
    });

    const parsed = aiParsingResponseSchema.parse(response.json);
    console.log(`[provider] Rules extracted via ${response.modelName}`);
    return parsed;
  } catch (error) {
    console.error("Error parsing formatting rules:", error);

    // Бюджет исчерпан — молчаливая подмена на ГОСТ была бы обманом: пользователь
    // загрузил методичку и получил бы чужие правила. Пусть решает роут.
    if (error instanceof AIBudgetExceededError) {
      throw error;
    }

    return {
      rules: DEFAULT_GOST_RULES,
      confidence: 0,
      warnings: [
        `Ошибка при парсинге требований: ${error instanceof Error ? error.message : "Unknown error"}`,
        "Используются стандартные правила по ГОСТ",
      ],
      missingRules: ["Все правила — используются значения по умолчанию"],
    };
  }
}

/**
 * Мерж правил: переопределяет дефолтные правила найденными
 */
export function mergeWithDefaults(
  parsedRules: Partial<FormattingRules>
): FormattingRules {
  return {
    document: {
      ...DEFAULT_GOST_RULES.document,
      ...parsedRules.document,
    },
    text: {
      ...DEFAULT_GOST_RULES.text,
      ...parsedRules.text,
    },
    headings: {
      level1: { ...DEFAULT_GOST_RULES.headings.level1, ...parsedRules.headings?.level1 },
      level2: { ...DEFAULT_GOST_RULES.headings.level2, ...parsedRules.headings?.level2 },
      level3: { ...DEFAULT_GOST_RULES.headings.level3, ...parsedRules.headings?.level3 },
      level4: parsedRules.headings?.level4,
    },
    lists: {
      ...DEFAULT_GOST_RULES.lists,
      ...parsedRules.lists,
    },
    specialElements: {
      ...DEFAULT_GOST_RULES.specialElements,
      ...parsedRules.specialElements,
    },
    additional: {
      ...DEFAULT_GOST_RULES.additional,
      ...parsedRules.additional,
    },
  };
}
