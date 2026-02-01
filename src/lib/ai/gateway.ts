/**
 * AI Gateway — единая точка входа для всех AI-вызовов
 *
 * Выбирает лучшую доступную модель, вызывает её и возвращает JSON.
 * При ошибке автоматически переключается на следующую модель.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { ModelConfig, getAvailableModels } from "./model-registry";
import { canUseModel, recordUsage, markModelFailed } from "./rate-limiter";

export interface GatewayRequest {
  /** Системный промпт */
  systemPrompt: string;
  /** Пользовательский промпт */
  userPrompt: string;
  /** Температура (по умолчанию 0.1) */
  temperature?: number;
  /** Максимальное количество токенов ответа */
  maxTokens?: number;
}

export interface GatewayResponse {
  /** Распарсенный JSON-ответ */
  json: unknown;
  /** Какая модель ответила */
  modelId: string;
  /** Название модели для логов */
  modelName: string;
}

/**
 * Вызов Gemini-модели
 */
async function callGemini(
  config: ModelConfig,
  request: GatewayRequest
): Promise<string> {
  const apiKey = process.env[config.apiKeyEnv]!;
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: config.modelId,
    generationConfig: {
      temperature: request.temperature ?? 0.1,
      responseMimeType: config.supportsJsonMode
        ? "application/json"
        : undefined,
      maxOutputTokens: request.maxTokens,
    },
  });

  const prompt = `${request.systemPrompt}\n\n${request.userPrompt}`;
  const result = await model.generateContent(prompt);
  return result.response.text();
}

/**
 * Вызов OpenAI-compatible модели (Groq, OpenRouter, Cerebras и др.)
 */
async function callOpenAICompatible(
  config: ModelConfig,
  request: GatewayRequest
): Promise<string> {
  const apiKey = process.env[config.apiKeyEnv]!;

  const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey,
    baseURL: config.baseUrl,
  };

  // OpenRouter требует дополнительные заголовки
  if (config.extraParams?.headers) {
    clientOptions.defaultHeaders = config.extraParams.headers as Record<
      string,
      string
    >;
  }

  const openai = new OpenAI(clientOptions);

  const response = await openai.chat.completions.create({
    model: config.modelId,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt },
    ],
    response_format: config.supportsJsonMode
      ? { type: "json_object" }
      : undefined,
    temperature: request.temperature ?? 0.1,
    max_tokens: request.maxTokens,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`${config.displayName} returned empty response`);
  }
  return content;
}

/**
 * Извлечь JSON из текстового ответа модели
 */
function extractJson(text: string): unknown {
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

/**
 * Лёгкая проверка доступности API провайдера (HTTP-уровень, без AI-запроса).
 * Не расходует rate limits и не тратит токены.
 */
async function checkProviderReachable(model: ModelConfig): Promise<boolean> {
  try {
    if (model.protocol === "gemini") {
      // Проверяем Gemini API — запрос list models
      const apiKey = process.env[model.apiKeyEnv];
      if (!apiKey) return false;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.modelId}?key=${apiKey}`,
        { method: "GET", signal: AbortSignal.timeout(5000) }
      );
      return res.ok;
    } else {
      // OpenAI-compatible — запрос /models
      const apiKey = process.env[model.apiKeyEnv];
      if (!apiKey) return false;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (model.extraParams?.headers) {
        Object.assign(headers, model.extraParams.headers);
      }
      const res = await fetch(`${model.baseUrl}/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok || res.status === 401; // 401 = key issue, but API reachable
    }
  } catch {
    return false;
  }
}

/**
 * Прогрев моделей — параллельно проверяет доступность API провайдеров
 * через лёгкие HTTP-запросы (без AI-вызовов, без расхода лимитов).
 * Недоступные провайдеры помечаются как failed.
 */
export async function warmupModels(): Promise<{
  total: number;
  alive: string[];
  dead: string[];
}> {
  const models = getAvailableModels();

  if (models.length === 0) {
    console.warn("[ai-gateway] No models configured for warmup");
    return { total: 0, alive: [], dead: [] };
  }

  console.log(
    `[ai-gateway] Warming up ${models.length} models: ${models.map((m) => m.id).join(", ")}`
  );

  // Группируем по провайдеру (apiKeyEnv+baseUrl) — пингуем каждый провайдер один раз
  const providerMap = new Map<string, ModelConfig[]>();
  for (const model of models) {
    const key = `${model.apiKeyEnv}|${model.baseUrl || "gemini"}`;
    const existing = providerMap.get(key) || [];
    existing.push(model);
    providerMap.set(key, existing);
  }

  const providerResults = await Promise.all(
    Array.from(providerMap.entries()).map(async ([key, providerModels]) => {
      const representative = providerModels[0];
      const reachable = await checkProviderReachable(representative);
      return { key, reachable, models: providerModels };
    })
  );

  const alive: string[] = [];
  const dead: string[] = [];

  for (const { reachable, models: providerModels } of providerResults) {
    for (const model of providerModels) {
      if (reachable) {
        alive.push(model.displayName);
      } else {
        dead.push(model.displayName);
        await markModelFailed(model.id);
      }
    }
  }

  console.log(
    `[ai-gateway] Warmup done: ${alive.length} alive [${alive.join(", ")}], ${dead.length} dead [${dead.join(", ")}]`
  );

  return { total: models.length, alive, dead };
}

/**
 * Главная функция: выбирает модель и отправляет запрос.
 * При ошибке пробует следующую модель.
 */
export async function callAI(request: GatewayRequest): Promise<GatewayResponse> {
  const models = getAvailableModels();

  console.log(`[ai-gateway] Available models: ${models.map(m => m.id).join(", ") || "NONE"}`);

  if (models.length === 0) {
    throw new Error(
      "Нет доступных AI-моделей. Настройте хотя бы один API-ключ в переменных окружения."
    );
  }

  const errors: string[] = [];

  for (const model of models) {
    // Проверяем лимиты
    const available = await canUseModel(
      model.id,
      model.limits.rpm,
      model.limits.rpd
    );
    if (!available) {
      errors.push(`${model.displayName}: лимит исчерпан`);
      continue;
    }

    try {
      // Регистрируем использование до вызова (оптимистично)
      await recordUsage(model.id);

      let rawText: string;

      if (model.protocol === "gemini") {
        rawText = await callGemini(model, request);
      } else {
        rawText = await callOpenAICompatible(model, request);
      }

      const json = extractJson(rawText);

      console.log(`[ai-gateway] Success with ${model.displayName}`);

      return {
        json,
        modelId: model.id,
        modelName: model.displayName,
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error);
      console.error(`[ai-gateway] ${model.displayName} failed: ${msg}`);
      errors.push(`${model.displayName}: ${msg}`);

      // Помечаем модель как нерабочую (на 1 минуту)
      await markModelFailed(model.id);

      // Продолжаем к следующей модели
      continue;
    }
  }

  throw new Error(
    `Все AI-модели недоступны:\n${errors.map((e) => `  - ${e}`).join("\n")}`
  );
}
