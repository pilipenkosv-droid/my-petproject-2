/**
 * Прогрев моделей: лёгкая HTTP-проверка доступности провайдеров.
 * Вынесено из gateway.ts — отдельная от выбора модели забота.
 */

import { ModelConfig, getAvailableModels } from "./model-registry";

/**
 * Лёгкая проверка доступности API провайдера (HTTP-уровень, без AI-запроса).
 * Не расходует rate limits и не тратит токены.
 */
export async function checkProviderReachable(model: ModelConfig): Promise<boolean> {
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
    } else if (model.protocol === "anthropic") {
      // Anthropic — GET /v1/models
      const apiKey = process.env[model.apiKeyEnv];
      if (!apiKey) return false;
      const res = await fetch("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(5000),
      });
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
 *
 * ВАЖНО: Warmup только информационный — НЕ помечает модели как failed.
 * Если пинг не прошёл — это не значит, что AI-запрос не пройдёт
 * (DNS/firewall на Vercel может блокировать GET /models).
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
        // НЕ вызываем markModelFailed — warmup не должен блокировать модели.
        // callAI сам пометит модель как failed если реальный запрос упадёт.
      }
    }
  }

  console.log(
    `[ai-gateway] Warmup done: ${alive.length} alive [${alive.join(", ")}], ${dead.length} dead [${dead.join(", ")}]`
  );

  return { total: models.length, alive, dead };
}
