/**
 * Транспорт AI Gateway: «как позвать модель X» и разбор её ответа.
 * Выбор модели, failover и бюджет — в gateway.ts.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { ModelConfig } from "./model-registry";
import { toGeminiResponseSchema, toOpenAIStrictSchema } from "@/lib/pipeline-v6/schema/adapter";
import type { GatewayRequest, GatewayResponse, ProviderResult, SchemaMode } from "./gateway-types";
import { callClaudeCli } from "./gateway-claude-cli";

export { callClaudeCli };

export type { GatewayRequest, GatewayResponse, ProviderResult, SchemaMode };

// Таймаут для AI вызовов. Реальная latency p50 на Vercel AI Gateway = 13с,
// p95 = 39с (CSV 2026-04-20), даже с thinkingBudget=1024 хвосты могут быть 20-30с.
// Vercel Pro maxDuration=300s — поднимаем таймаут чтобы не резать запросы.
export const AI_CALL_TIMEOUT_PAID_MS = 50000;
export const AI_CALL_TIMEOUT_FREE_MS = 50000;
export const AI_CALL_TIMEOUT_GEMINI_MS = 50000;

/** Платные провайдеры (по apiKeyEnv) */
export const PAID_PROVIDERS = new Set(["ANTHROPIC_API_KEY", "AITUNNEL_API_KEY", "AI_GATEWAY_API_KEY"]);

/** Обёртка для добавления таймаута к Promise */
export function withTimeout<T>(promise: Promise<T>, ms: number, modelName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${modelName} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/** Вызов Gemini-модели */
export async function callGemini(
  config: ModelConfig,
  request: GatewayRequest
): Promise<ProviderResult> {
  const apiKey = process.env[config.apiKeyEnv]!;
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: config.modelId,
    generationConfig: {
      temperature: request.temperature ?? 0.1,
      responseMimeType: config.supportsJsonMode && !request.textMode
        ? "application/json"
        : undefined,
      // Нативный путь Gemini: схема уезжает как responseSchema (подмножество OpenAPI 3).
      responseSchema: request.jsonSchema && !request.textMode
        ? toGeminiResponseSchema(request.jsonSchema.schema)
        : undefined,
      maxOutputTokens: request.maxTokens,
      // Размышления: false → 0 (выключить), иначе бюджет токенов.
      thinkingConfig: {
        thinkingBudget: request.thinking === false ? 0 : (request.thinking ?? 1024),
      },
    } as any,
  });

  const prompt = `${request.systemPrompt}\n\n${request.userPrompt}`;
  const result = await model.generateContent(prompt);
  const candidate = result.response.candidates?.[0];
  const usage = result.response.usageMetadata;
  return {
    text: result.response.text(),
    finishReason: candidate?.finishReason === "MAX_TOKENS" ? "length" : candidate?.finishReason,
    schemaMode: request.jsonSchema && !request.textMode ? "json_schema" : "none",
    usage: {
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
    },
  };
}

/** 400 именно про структурированный вывод, а не про что-то ещё в запросе. */
export function isSchemaRejection(status: number, errorText: string): boolean {
  if (status !== 400) return false;
  return /response[_ ]?(format|schema)|json[_ ]?schema|structured output|unsupported|not supported|only allowed for/i.test(
    errorText
  );
}

/**
 * Вызов OpenAI-compatible модели через raw fetch.
 *
 * OpenAI SDK v4.104 несовместим с Node.js v24 (Vercel runtime) —
 * выбрасывает "Connection error" при рабочем соединении.
 * Raw fetch доказанно работает на Vercel (тест 2026-04-15).
 */
export async function callOpenAICompatible(
  config: ModelConfig,
  request: GatewayRequest,
  timeoutMs?: number
): Promise<ProviderResult> {
  const apiKey = process.env[config.apiKeyEnv]!;
  const timeout = timeoutMs ?? (PAID_PROVIDERS.has(config.apiKeyEnv)
    ? AI_CALL_TIMEOUT_PAID_MS
    : AI_CALL_TIMEOUT_FREE_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // OpenRouter требует дополнительные заголовки
  if (config.extraParams?.headers) {
    Object.assign(headers, config.extraParams.headers);
  }

  const body: Record<string, unknown> = {
    model: config.modelId,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt },
    ],
    temperature: request.temperature ?? 0.1,
  };

  if (request.maxTokens) {
    body.max_tokens = request.maxTokens;
  }

  let schemaMode: SchemaMode = "none";
  if (request.jsonSchema && !request.textMode) {
    // strict требует, чтобы у каждого объекта были additionalProperties:false
    // и required со всеми ключами, — приводим схему к этому виду.
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: request.jsonSchema.name,
        schema: toOpenAIStrictSchema(request.jsonSchema.schema),
        strict: true,
      },
    };
    schemaMode = "json_schema";
  } else if (config.supportsJsonMode && !request.textMode) {
    body.response_format = { type: "json_object" };
    schemaMode = "json_object";
  }

  if (request.thinking === false) {
    body.reasoning = { enabled: false };
  } else if (typeof request.thinking === "number" && request.thinking > 0) {
    body.reasoning = { max_tokens: request.thinking };
  }

  // Прокидываем extraParams в тело запроса (кроме headers)
  if (config.extraParams) {
    for (const [key, value] of Object.entries(config.extraParams)) {
      if (key !== "headers") {
        body[key] = value;
      }
    }
  }

  const post = () =>
    fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });

  let resp = await post();
  let errorText = resp.ok ? "" : await resp.text().catch(() => "");

  // Шлюз может не принять json_schema (каталог gemini-2.5-flash его не
  // перечисляет). Это не сбой модели: повторяем ТОТ ЖЕ вызов в режиме
  // json_object — схема остаётся в тексте промпта. Попытку failover не тратим.
  if (!resp.ok && schemaMode === "json_schema" && isSchemaRejection(resp.status, errorText)) {
    // Причину печатаем: без неё откат на json_object выглядит как норма шлюза,
    // а это может быть наша сломанная схема (живая проверка 18.09.2026).
    console.warn(
      `[gateway] ${config.displayName} отверг json_schema, повтор с json_object: ` +
        errorText.slice(0, 300)
    );
    body.response_format = { type: "json_object" };
    schemaMode = "json_object";
    resp = await post();
    errorText = resp.ok ? "" : await resp.text().catch(() => "");
  }

  if (!resp.ok) {
    throw new Error(
      `${config.displayName} HTTP ${resp.status}: ${errorText.slice(0, 200)}`
    );
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${config.displayName} returned empty response`);
  }
  return {
    text: content,
    finishReason: data?.choices?.[0]?.finish_reason,
    usage: {
      inputTokens: data?.usage?.prompt_tokens,
      outputTokens: data?.usage?.completion_tokens,
    },
    schemaMode,
  };
}

/** Вызов Anthropic-модели (Claude) */
export async function callAnthropic(
  config: ModelConfig,
  request: GatewayRequest,
  timeoutMs?: number
): Promise<ProviderResult> {
  const apiKey = process.env[config.apiKeyEnv]!;

  const client = new Anthropic({
    apiKey,
    timeout: timeoutMs ?? AI_CALL_TIMEOUT_FREE_MS,
  });

  const message = await client.messages.create({
    model: config.modelId,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature ?? 0.1,
    system: request.systemPrompt,
    messages: [{ role: "user", content: request.userPrompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`${config.displayName} returned no text content`);
  }
  return {
    text: textBlock.text,
    finishReason: message.stop_reason === "max_tokens" ? "length" : message.stop_reason ?? undefined,
    usage: {
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
    },
  };
}

/** Извлечь JSON из текстового ответа модели */
export function extractJson(text: string): unknown {
  // Сначала пробуем распарсить весь текст как JSON
  try {
    return JSON.parse(text);
  } catch {
    // Пробуем найти JSON-объект в тексте
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Если даже найденный фрагмент не парсится
      }
    }
    const preview = text.substring(0, 200);
    throw new Error(`Could not extract JSON from AI response: "${preview}"`);
  }
}

/** Диспетчер транспорта: вызвать модель по её протоколу с заданным таймаутом. */
export async function invokeModel(
  model: ModelConfig,
  request: GatewayRequest,
  timeoutMs: number
): Promise<ProviderResult> {
  if (model.protocol === "gemini") {
    return withTimeout(callGemini(model, request), timeoutMs, model.displayName);
  }
  if (model.protocol === "anthropic") {
    return withTimeout(callAnthropic(model, request, timeoutMs), timeoutMs, model.displayName);
  }
  if (model.protocol === "claude-cli") {
    return withTimeout(callClaudeCli(model, request), timeoutMs, model.displayName);
  }
  return withTimeout(callOpenAICompatible(model, request, timeoutMs), timeoutMs, model.displayName);
}

/** Базовый таймаут попытки для модели (до обрезки по бюджету запроса). */
export function baseTimeoutFor(model: ModelConfig): number {
  if (model.protocol === "gemini") return AI_CALL_TIMEOUT_GEMINI_MS;
  if (model.protocol === "claude-cli") return 120_000;
  return PAID_PROVIDERS.has(model.apiKeyEnv)
    ? AI_CALL_TIMEOUT_PAID_MS
    : AI_CALL_TIMEOUT_FREE_MS;
}
