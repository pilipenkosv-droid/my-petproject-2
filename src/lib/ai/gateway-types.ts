/**
 * Контракт вызова AI Gateway: что уходит в модель и что возвращает транспорт.
 * Вынесено из gateway-providers.ts, чтобы файл транспорта остался обозримым.
 */

import type { JsonSchemaNode } from "@/lib/pipeline-v6/schema/adapter";

export interface GatewayRequest {
  /** Системный промпт */
  systemPrompt: string;
  /** Пользовательский промпт */
  userPrompt: string;
  /** Температура (по умолчанию 0.1) */
  temperature?: number;
  /** Максимальное количество токенов ответа */
  maxTokens?: number;
  /** Возвращать текст вместо JSON (для чата) */
  textMode?: boolean;
  /**
   * Бюджет «размышлений» модели.
   *   false  — выключить (извлечение/классификация: думать не над чем);
   *   число  — лимит токенов на размышление (> 0);
   *   не задан — как решит провайдер.
   *
   * ВАЖНО: у AI Gateway это поле верхнего уровня `reasoning`, а НЕ
   * providerOptions — там принимается только ключ `gateway` (роутинг).
   * Каталог google/gemini-2.5-flash: reasoning_options = toggle + budget_tokens.
   * `reasoning.max_tokens: 0` Gateway отвергает («expected number to be >0»),
   * поэтому выключаем через toggle.
   */
  thinking?: false | number;
  /**
   * Абсолютный дедлайн всего запроса (ms since epoch). Роут кладёт сюда остаток
   * от лимита функции Vercel: таймаут попытки обрезается по остатку бюджета,
   * а когда остаётся меньше MIN_ATTEMPT_MS — failover прекращается.
   */
  deadline?: number;
  /**
   * Схема ответа (structured output). Плоская JSON Schema без $ref —
   * транспорт сам приводит её к формату провайдера. Без неё остаётся
   * прежний режим `response_format: {type: "json_object"}`.
   */
  jsonSchema?: { name: string; schema: JsonSchemaNode };
}

/** Что вернул транспорт, помимо текста: нужно, чтобы отличить обрыв от мусора. */
export interface ProviderResult {
  text: string;
  /** "length" = ответ обрезан по лимиту токенов. */
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface GatewayResponse {
  /** Распарсенный JSON-ответ */
  json: unknown;
  /** Какая модель ответила */
  modelId: string;
  /** Название модели для логов */
  modelName: string;
  /** "length" = модель упёрлась в maxTokens и JSON оборван */
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}
