/**
 * AI-разметка блоков документа
 *
 * Определяет тип каждого параграфа (заголовок, текст, библиография и т.д.)
 * с помощью AI-провайдера (Gemini / OpenAI / Anthropic).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  DocumentBlockMarkup,
  documentBlockMarkupSchema,
  BlockMarkupItem,
} from "./block-markup-schemas";
import {
  BLOCK_MARKUP_SYSTEM_PROMPT,
  createBlockMarkupPrompt,
} from "./block-markup-prompts";

type AIProvider = "openai" | "anthropic" | "gemini";

interface AIConfig {
  provider: AIProvider;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
}

function getAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER || "gemini") as AIProvider;
  return {
    provider,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
  };
}

async function markupWithOpenAI(
  paragraphs: Array<{ index: number; text: string; style?: string }>,
  apiKey: string
): Promise<DocumentBlockMarkup> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: BLOCK_MARKUP_SYSTEM_PROMPT },
      { role: "user", content: createBlockMarkupPrompt(paragraphs) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty response for block markup");
  }

  const parsed = JSON.parse(content);
  return documentBlockMarkupSchema.parse(parsed);
}

async function markupWithAnthropic(
  paragraphs: Array<{ index: number; text: string; style?: string }>,
  apiKey: string
): Promise<DocumentBlockMarkup> {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    system: BLOCK_MARKUP_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: createBlockMarkupPrompt(paragraphs) },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic returned no text content for block markup");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from Anthropic block markup response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return documentBlockMarkupSchema.parse(parsed);
}

async function markupWithGemini(
  paragraphs: Array<{ index: number; text: string; style?: string }>,
  apiKey: string
): Promise<DocumentBlockMarkup> {
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const prompt = `${BLOCK_MARKUP_SYSTEM_PROMPT}\n\n${createBlockMarkupPrompt(paragraphs)}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  if (!text) {
    throw new Error("Gemini returned empty response for block markup");
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from Gemini block markup response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return documentBlockMarkupSchema.parse(parsed);
}

/**
 * Создаёт fallback-разметку при ошибке AI — все параграфы получают тип unknown
 */
function createFallbackMarkup(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): DocumentBlockMarkup {
  const blocks: BlockMarkupItem[] = paragraphs.map((p) => ({
    paragraphIndex: p.index,
    blockType: p.text.trim() === "" ? "empty" as const : "unknown" as const,
    confidence: 0,
  }));

  return {
    blocks,
    warnings: ["AI-разметка не удалась, используется fallback с типом unknown"],
  };
}

/**
 * Размечает параграфы документа по типам блоков через AI
 */
export async function parseDocumentBlocks(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Promise<DocumentBlockMarkup> {
  if (paragraphs.length === 0) {
    return { blocks: [], warnings: [] };
  }

  const config = getAIConfig();

  try {
    switch (config.provider) {
      case "openai":
        if (!config.openaiApiKey) {
          throw new Error("OPENAI_API_KEY is not configured");
        }
        return await markupWithOpenAI(paragraphs, config.openaiApiKey);

      case "anthropic":
        if (!config.anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY is not configured");
        }
        return await markupWithAnthropic(paragraphs, config.anthropicApiKey);

      case "gemini":
        if (!config.geminiApiKey) {
          throw new Error(
            "GEMINI_API_KEY is not configured. Get a free key at https://aistudio.google.com/"
          );
        }
        return await markupWithGemini(paragraphs, config.geminiApiKey);

      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  } catch (error) {
    console.error("Error in AI block markup:", error);
    return createFallbackMarkup(paragraphs);
  }
}
