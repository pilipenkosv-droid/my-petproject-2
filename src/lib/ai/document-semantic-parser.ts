/**
 * Семантический анализатор документа
 * 
 * Использует AI для определения структуры документа:
 * - Типы секций (введение, главы, заключение, библиография)
 * - Иерархия заголовков
 * - Детальный анализ списка литературы с проблемами форматирования
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  SemanticStructure,
  semanticStructureSchema,
} from "./semantic-schemas";
import {
  SEMANTIC_ANALYSIS_SYSTEM_PROMPT,
  createSemanticAnalysisPrompt,
} from "./semantic-prompts";

type AIProvider = "openai" | "anthropic" | "gemini";

interface AIConfig {
  provider: AIProvider;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
}

/**
 * Получить конфигурацию AI из переменных окружения
 */
function getAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER || "gemini") as AIProvider;

  return {
    provider,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
  };
}

/**
 * Парсинг через OpenAI
 */
async function parseWithOpenAI(
  paragraphs: Array<{ index: number; text: string }>,
  apiKey: string
): Promise<SemanticStructure> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SEMANTIC_ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: createSemanticAnalysisPrompt(paragraphs) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty response");
  }

  const parsed = JSON.parse(content);
  return semanticStructureSchema.parse(parsed);
}

/**
 * Парсинг через Anthropic Claude
 */
async function parseWithAnthropic(
  paragraphs: Array<{ index: number; text: string }>,
  apiKey: string
): Promise<SemanticStructure> {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    system: SEMANTIC_ANALYSIS_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: createSemanticAnalysisPrompt(paragraphs) },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }

  // Извлекаем JSON из ответа
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from Anthropic response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return semanticStructureSchema.parse(parsed);
}

/**
 * Парсинг через Google Gemini
 */
async function parseWithGemini(
  paragraphs: Array<{ index: number; text: string }>,
  apiKey: string
): Promise<SemanticStructure> {
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const prompt = `${SEMANTIC_ANALYSIS_SYSTEM_PROMPT}

${createSemanticAnalysisPrompt(paragraphs)}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  // Извлекаем JSON из ответа
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from Gemini response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return semanticStructureSchema.parse(parsed);
}

/**
 * Главная функция для семантического анализа документа
 */
export async function parseDocumentSemantics(
  paragraphs: Array<{ index: number; text: string }>
): Promise<SemanticStructure> {
  const config = getAIConfig();

  try {
    switch (config.provider) {
      case "openai":
        if (!config.openaiApiKey) {
          throw new Error("OPENAI_API_KEY is not configured");
        }
        return await parseWithOpenAI(paragraphs, config.openaiApiKey);

      case "anthropic":
        if (!config.anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY is not configured");
        }
        return await parseWithAnthropic(paragraphs, config.anthropicApiKey);

      case "gemini":
        if (!config.geminiApiKey) {
          throw new Error(
            "GEMINI_API_KEY is not configured. Get a free key at https://aistudio.google.com/"
          );
        }
        return await parseWithGemini(paragraphs, config.geminiApiKey);

      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  } catch (error) {
    console.error("Error parsing document semantics:", error);

    // Возвращаем базовую структуру при ошибке
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
