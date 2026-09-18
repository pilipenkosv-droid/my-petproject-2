/**
 * Извлечение правил форматирования из методички через AI Gateway.
 *
 * Схема ответа уезжает в запрос двумя поясами (тело + промпт, см. rules-schema.ts),
 * ответ разбирается терпимо (снятие null → Zod → нормализация имён → Zod),
 * а при неудаче функция БРОСАЕТ RulesExtractionError. Молчаливой подмены на
 * DEFAULT_GOST_RULES здесь больше нет: пользователь, загрузивший методичку,
 * получает либо свои правила, либо явную ошибку.
 */

import { callAI, AIBudgetExceededError, AIResponseTruncatedError } from "./gateway";
import { AIParsingResponse, aiParsingResponseSchema } from "./schemas";
import { RULES_EXTRACTION_SYSTEM_PROMPT, createRulesExtractionPrompt } from "./prompts";
import { getRulesResponseJsonSchema, RULES_SCHEMA_NAME } from "./rules-schema";
import { countRuleLeaves, normalizeResponseKeys, stripNulls } from "./rules-normalize";
import { prefilterGuidelines } from "./rules-prefilter";
import { DEFAULT_GOST_RULES, FormattingRules } from "@/types/formatting-rules";

/** Потолок ответа. 6000 не хватало на длинных методичках (бенч 18.09: 2 из 15). */
const RULES_MAX_OUTPUT_TOKENS = 8000;

export type RulesExtractionReason = "schema_mismatch" | "truncated" | "timeout" | "provider";

/** Извлечение не состоялось. Роут превращает это в 422 и понятный текст. */
export class RulesExtractionError extends Error {
  constructor(
    readonly reason: RulesExtractionReason,
    technicalDetails: string
  ) {
    super(technicalDetails);
    this.name = "RulesExtractionError";
  }
}

/** Причина отказа → текст для пользователя. Технические детали остаются в логах. */
export function rulesExtractionMessage(error: RulesExtractionError): string {
  const why: Record<string, string> = {
    schema_mismatch: "модель вернула ответ не по схеме",
    truncated: "методичка слишком большая, ответ не поместился целиком",
    timeout: "не дождались ответа модели",
    provider: "AI-модели сейчас недоступны",
  };
  return (
    `Не удалось извлечь правила из методички: ${why[error.reason] ?? "неизвестная ошибка"}. ` +
    "Попробуйте загрузить методичку в .docx/.txt, или выберите режим ГОСТ."
  );
}

export interface RulesExtractionResult extends AIParsingResponse {
  /** Ответ пришлось приводить к именам схемы — значит structured output не сработал. */
  normalized: boolean;
  /** Понадобился компактный повтор после обрыва по лимиту токенов. */
  retriedCompact: boolean;
  /** Сколько символов методички снял предфильтр. */
  droppedChars: number;
  modelId?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** Разбор ответа: null-и прочь → Zod → нормализация имён → Zod. */
export function parseRulesResponse(raw: unknown): { parsed: AIParsingResponse; normalized: boolean } {
  const cleaned = stripNulls(raw);

  const direct = aiParsingResponseSchema.safeParse(cleaned);
  if (direct.success && countRuleLeaves(direct.data.rules) > 0) {
    return { parsed: direct.data, normalized: false };
  }

  const renamed = stripNulls(normalizeResponseKeys(cleaned));
  const second = aiParsingResponseSchema.safeParse(renamed);
  if (second.success && countRuleLeaves(second.data.rules) > 0) {
    return { parsed: second.data, normalized: true };
  }

  const issue = second.success
    ? "модель не вернула ни одного правила"
    : second.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new RulesExtractionError("schema_mismatch", `Ответ не соответствует схеме (${issue})`);
}

async function requestRules(
  text: string,
  options: { deadline?: number; compact: boolean }
): Promise<RulesExtractionResult> {
  const response = await callAI({
    systemPrompt: RULES_EXTRACTION_SYSTEM_PROMPT,
    userPrompt: createRulesExtractionPrompt(text, { compact: options.compact }),
    temperature: 0.1,
    // Разбор методички — извлечение полей. Размышления здесь давали
    // 2500–10500 reasoning-токенов и 14–49с на вызов (экспорт Gateway 17–18.09).
    thinking: false,
    maxTokens: RULES_MAX_OUTPUT_TOKENS,
    jsonSchema: { name: RULES_SCHEMA_NAME, schema: getRulesResponseJsonSchema() },
    deadline: options.deadline,
  });

  const { parsed, normalized } = parseRulesResponse(response.json);
  console.log(
    `[provider] Rules extracted via ${response.modelName}` +
      `${normalized ? " (имена полей нормализованы)" : ""}`
  );
  return {
    ...parsed,
    normalized,
    retriedCompact: options.compact,
    droppedChars: 0,
    modelId: response.modelId,
    usage: response.usage,
  };
}

/** Классификация чужих ошибок в причину отказа. */
function toExtractionError(error: unknown): RulesExtractionError {
  if (error instanceof RulesExtractionError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AIResponseTruncatedError) {
    return new RulesExtractionError("truncated", message);
  }
  if (/timeout|дедлайн|бюджет/i.test(message)) {
    return new RulesExtractionError("timeout", message);
  }
  return new RulesExtractionError("provider", message);
}

/**
 * Главная функция для парсинга правил форматирования.
 * Бросает RulesExtractionError; AIBudgetExceededError пробрасывается как есть —
 * у роута на него свой ответ (504).
 */
export async function parseFormattingRules(
  requirementsText: string,
  options: { deadline?: number } = {}
): Promise<RulesExtractionResult> {
  const prefiltered = prefilterGuidelines(requirementsText);
  if (prefiltered.applied) {
    console.log(
      `[provider] Предфильтр: ${requirementsText.length} → ${prefiltered.text.length} символов ` +
        `(снято ${prefiltered.droppedChars})`
    );
  }

  const run = (compact: boolean) =>
    requestRules(prefiltered.text, { deadline: options.deadline, compact });

  try {
    const result = await run(false);
    return { ...result, droppedChars: prefiltered.droppedChars };
  } catch (error) {
    if (error instanceof AIBudgetExceededError) throw error;

    // Обрыв по лимиту токенов — единственный случай, когда повтор оправдан:
    // просим тот же результат компактнее. Второго полного вызова не делаем.
    if (error instanceof AIResponseTruncatedError) {
      console.warn("[provider] Ответ обрезан по лимиту, повтор в компактном режиме");
      try {
        const result = await run(true);
        return { ...result, droppedChars: prefiltered.droppedChars };
      } catch (retryError) {
        if (retryError instanceof AIBudgetExceededError) throw retryError;
        console.error("Rules extraction failed after compact retry:", retryError);
        throw toExtractionError(
          retryError instanceof AIResponseTruncatedError ? error : retryError
        );
      }
    }

    console.error("Rules extraction failed:", error);
    throw toExtractionError(error);
  }
}

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Глубокий мерж: лист из ответа побеждает, отсутствующий берётся из ГОСТ. */
function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (
    typeof base !== "object" || base === null || Array.isArray(base) ||
    typeof override !== "object" || Array.isArray(override)
  ) {
    return override as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

/**
 * Мерж правил: дефолты закрывают ТОЛЬКО отсутствующие листья.
 * Секции целиком не заменяются — иначе частично заполненный specialElements
 * стирал бы дефолтные правила таблиц и рисунков.
 */
export function mergeWithDefaults(
  parsedRules?: DeepPartial<FormattingRules>
): FormattingRules {
  return deepMerge(DEFAULT_GOST_RULES, parsedRules ?? {});
}
