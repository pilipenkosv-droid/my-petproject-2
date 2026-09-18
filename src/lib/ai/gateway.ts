/**
 * AI Gateway — единая точка входа для всех AI-вызовов
 *
 * Выбирает лучшую доступную модель, вызывает её и возвращает JSON.
 * При ошибке автоматически переключается на следующую модель.
 * Сами вызовы провайдеров — в gateway-providers.ts.
 */

import { ModelConfig, getAvailableModels } from "./model-registry";
import { canUseModel, recordUsage, markModelFailed, logDailySuccess, logDailyFailure } from "./rate-limiter";
import { extractJson, invokeModel, baseTimeoutFor } from "./gateway-providers";

export { warmupModels } from "./gateway-warmup";

export type { GatewayRequest, GatewayResponse } from "./gateway-providers";
import type { GatewayRequest, GatewayResponse } from "./gateway-providers";

/** Максимум моделей для попыток (Vercel 60s / 12s timeout = 5 попыток с запасом) */
const MAX_MODEL_ATTEMPTS = 4;

/** Минимальный остаток бюджета, при котором ещё есть смысл начинать попытку. */
const MIN_ATTEMPT_MS = 5_000;

/**
 * Модели, ответившие «такой модели нет» — в рамках процесса больше не трогаем.
 * Это не временный сбой: повтор даст ту же 404/400 и съест попытку.
 */
const fatalModels = new Set<string>();

/** Ошибка модели, которую бессмысленно повторять: её больше нет у провайдера. */
function isFatalModelError(message: string): boolean {
  return /HTTP (400|404)/.test(message) &&
    /(not found|no longer available|is not supported|unknown model|does not exist)/i.test(message);
}

/** Исчерпана квота провайдера — сразу к следующей модели, попытку не тратим. */
function isQuotaError(message: string): boolean {
  return /HTTP (429|402)/.test(message) || /quota|rate.?limit|insufficient/i.test(message);
}

/**
 * Ошибка когда все AI-модели недоступны.
 * Содержит технические детали для логов, но НЕ для пользователя.
 */
export class AllModelsUnavailableError extends Error {
  constructor(technicalDetails: string) {
    super(technicalDetails);
    this.name = "AllModelsUnavailableError";
  }
}

/**
 * Бюджет запроса исчерпан раньше, чем модель ответила.
 * Отличается от AllModelsUnavailableError: провайдеры живы, не хватило времени.
 */
export class AIBudgetExceededError extends Error {
  constructor(technicalDetails: string) {
    super(technicalDetails);
    this.name = "AIBudgetExceededError";
  }
}

/**
 * Модель упёрлась в maxTokens: JSON оборван на полуслове.
 * Failover бессмысленен — у следующей модели тот же потолок, — поэтому
 * ошибка выбрасывается сразу, а решение (компактный повтор) принимает вызывающий.
 */
export class AIResponseTruncatedError extends Error {
  constructor(
    technicalDetails: string,
    readonly modelId: string,
    readonly usage?: { inputTokens?: number; outputTokens?: number }
  ) {
    super(technicalDetails);
    this.name = "AIResponseTruncatedError";
  }
}

/**
 * Главная функция: выбирает модель и отправляет запрос.
 * При ошибке пробует следующую модель.
 */
/** Доступные модели в порядке приоритета (с учётом bench-форса). */
function selectModels(): ModelConfig[] {
  let models = getAvailableModels();

  const forceModel = process.env.BENCH_FORCE_MODEL;
  if (forceModel) models = models.filter((m) => m.id === forceModel);

  console.log(`[ai-gateway] Available models: ${models.map((m) => m.id).join(", ") || "NONE"}`);

  if (models.length === 0) {
    throw new Error(
      "Нет доступных AI-моделей. Настройте хотя бы один API-ключ в переменных окружения."
    );
  }
  return models;
}

/**
 * Обрабатывает провал модели. Возвращает true, если отказ был мгновенным
 * (модели нет / нет квоты) и попытку нужно вернуть в бюджет failover.
 */
async function noteFailure(model: ModelConfig, msg: string): Promise<boolean> {
  console.error(`[ai-gateway] ${model.displayName} failed: ${msg}`);

  await markModelFailed(model.id);
  logDailyFailure(model.id).catch(() => {});

  if (isFatalModelError(msg)) {
    fatalModels.add(model.id);
    console.warn(`[ai-gateway] ${model.displayName} помечена как недоступная навсегда`);
    return true;
  }
  return isQuotaError(msg);
}

export async function callAI(request: GatewayRequest): Promise<GatewayResponse> {
  const models = selectModels();
  const errors: string[] = [];
  let attempts = 0;
  let budgetExhausted = false;

  for (const model of models) {
    if (attempts >= MAX_MODEL_ATTEMPTS) {
      errors.push(`Достигнут лимит попыток (${MAX_MODEL_ATTEMPTS})`);
      break;
    }

    // Модель, которой больше нет у провайдера — не тратим на неё попытку.
    if (fatalModels.has(model.id)) {
      errors.push(`${model.displayName}: модель недоступна у провайдера (пропущена)`);
      continue;
    }

    // Остаток бюджета запроса: меньше MIN_ATTEMPT_MS — начинать попытку бессмысленно.
    const remaining = request.deadline
      ? request.deadline - Date.now()
      : Number.POSITIVE_INFINITY;
    if (remaining < MIN_ATTEMPT_MS) {
      budgetExhausted = true;
      errors.push(
        `Бюджет запроса исчерпан (осталось ${Math.max(0, Math.round(remaining))}ms), failover остановлен`
      );
      break;
    }

    if (!(await canUseModel(model.id, model.limits.rpm, model.limits.rpd))) {
      errors.push(`${model.displayName}: лимит исчерпан`);
      continue;
    }

    attempts++;
    try {
      // Таймаут попытки не может быть длиннее остатка бюджета всего запроса.
      const timeout = Math.min(baseTimeoutFor(model), remaining);
      const result = await invokeModel(model, request, timeout);

      // Обрыв по лимиту токенов: у следующей модели потолок тот же, failover не поможет.
      if (result.finishReason === "length" && !request.textMode) {
        await recordUsage(model.id);
        throw new AIResponseTruncatedError(
          `${model.displayName}: ответ обрезан по лимиту (finish_reason=length)`,
          model.id,
          result.usage
        );
      }

      const json = request.textMode ? result.text : extractJson(result.text);

      // Регистрируем использование ПОСЛЕ успешного вызова
      await recordUsage(model.id);
      logDailySuccess(model.id).catch(() => {});
      console.log(`[ai-gateway] Success with ${model.displayName}`);

      return {
        json,
        modelId: model.id,
        modelName: model.displayName,
        finishReason: result.finishReason,
        usage: result.usage,
        schemaMode: result.schemaMode,
      };
    } catch (error) {
      if (error instanceof AIResponseTruncatedError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${model.displayName}: ${msg}`);
      // Быстрый отказ (нет модели / нет квоты) времени не стоил — попытку возвращаем.
      if (await noteFailure(model, msg)) attempts--;
      continue;
    }
  }

  const details = errors.map((e) => `  - ${e}`).join("\n");
  if (budgetExhausted) {
    throw new AIBudgetExceededError(`Бюджет AI-запроса исчерпан:\n${details}`);
  }
  throw new AllModelsUnavailableError(`Все AI-модели недоступны:\n${details}`);
}
