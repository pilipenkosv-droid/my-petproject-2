/**
 * JSON Schema ответа для извлечения правил.
 *
 * Один источник правды для обоих «ремней»:
 *   1) схема уезжает в тело запроса (structured output);
 *   2) она же вставляется в промпт — шлюз может параметр проигнорировать
 *      (каталог google/gemini-2.5-flash не перечисляет response_format).
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { toGeminiResponseSchema, type JsonSchemaNode } from "@/lib/pipeline-v6/schema/adapter";
import { aiParsingRequestSchema } from "./schemas";

export const RULES_SCHEMA_NAME = "formatting_rules_response";

let cachedPlain: JsonSchemaNode | null = null;
let cachedPrompt: string | null = null;

/**
 * Плоская JSON Schema без $ref: транспорт доводит её до формата провайдера.
 * $refStrategy: "none" обязателен — zod-to-json-schema иначе ссылается на
 * повторяющиеся подсхемы (headings.level2 → level1), а такие $ref шлюз не примет.
 */
export function getRulesResponseJsonSchema(): JsonSchemaNode {
  if (!cachedPlain) {
    const raw = zodToJsonSchema(aiParsingRequestSchema, { $refStrategy: "none" }) as JsonSchemaNode;
    delete raw.$schema;
    cachedPlain = raw;
  }
  return cachedPlain;
}

/** Та же схема, ужатая для вставки в текст промпта (без служебных ключей). */
export function getRulesPromptSchema(): string {
  if (!cachedPrompt) {
    cachedPrompt = JSON.stringify(toGeminiResponseSchema(getRulesResponseJsonSchema()));
  }
  return cachedPrompt;
}

/** Ключи верхнего уровня внутри rules — для нормализации имён полей ответа. */
export function getRulesSectionKeys(): string[] {
  const rules = (getRulesResponseJsonSchema().properties as JsonSchemaNode | undefined)
    ?.rules as JsonSchemaNode | undefined;
  return Object.keys((rules?.properties as JsonSchemaNode | undefined) ?? {});
}
