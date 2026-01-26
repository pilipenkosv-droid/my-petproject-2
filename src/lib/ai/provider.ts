/**
 * Абстракция AI-провайдера с поддержкой OpenAI, Anthropic и Google Gemini
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIParsingResponse, aiParsingResponseSchema, formattingRulesSchema } from "./schemas";
import { RULES_EXTRACTION_SYSTEM_PROMPT, createRulesExtractionPrompt } from "./prompts";
import { DEFAULT_GOST_RULES, FormattingRules } from "@/types/formatting-rules";

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
 * Парсинг правил форматирования через OpenAI
 */
async function parseRulesWithOpenAI(
  requirementsText: string,
  apiKey: string
): Promise<AIParsingResponse> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: RULES_EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: createRulesExtractionPrompt(requirementsText) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1, // Низкая температура для детерминированных результатов
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty response");
  }

  const parsed = JSON.parse(content);
  return aiParsingResponseSchema.parse(parsed);
}

/**
 * Парсинг правил форматирования через Anthropic Claude
 */
async function parseRulesWithAnthropic(
  requirementsText: string,
  apiKey: string
): Promise<AIParsingResponse> {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4096,
    system: RULES_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: createRulesExtractionPrompt(requirementsText) },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }

  // Извлекаем JSON из ответа (Claude может добавить текст вокруг)
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from Anthropic response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return aiParsingResponseSchema.parse(parsed);
}

/**
 * Парсинг правил форматирования через Google Gemini
 */
async function parseRulesWithGemini(
  requirementsText: string,
  apiKey: string
): Promise<AIParsingResponse> {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const prompt = `${RULES_EXTRACTION_SYSTEM_PROMPT}

${createRulesExtractionPrompt(requirementsText)}`;

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
  return aiParsingResponseSchema.parse(parsed);
}

/**
 * Главная функция для парсинга правил форматирования
 */
export async function parseFormattingRules(
  requirementsText: string
): Promise<AIParsingResponse> {
  const config = getAIConfig();

  try {
    switch (config.provider) {
      case "openai":
        if (!config.openaiApiKey) {
          throw new Error("OPENAI_API_KEY is not configured");
        }
        return await parseRulesWithOpenAI(requirementsText, config.openaiApiKey);
      
      case "anthropic":
        if (!config.anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY is not configured");
        }
        return await parseRulesWithAnthropic(requirementsText, config.anthropicApiKey);
      
      case "gemini":
        if (!config.geminiApiKey) {
          throw new Error("GEMINI_API_KEY is not configured. Get a free key at https://aistudio.google.com/");
        }
        return await parseRulesWithGemini(requirementsText, config.geminiApiKey);
      
      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  } catch (error) {
    console.error("Error parsing formatting rules:", error);
    
    // Возвращаем дефолтные правила с предупреждением при ошибке
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
