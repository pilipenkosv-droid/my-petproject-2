// Schema Adapter — Zod → per-provider JSON schema format.
//
// Each LLM provider expects structured-output schemas in slightly different shapes:
//   - Gemini: responseSchema with OpenAPI-3-subset (no $ref, no additionalProperties)
//   - OpenAI: response_format.json_schema with strict=true
//   - Anthropic: tool-calling `input_schema` (draft-07 compatible)
//
// This adapter wraps `zod-to-json-schema` and post-processes for each provider.

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type Provider = "gemini" | "openai" | "anthropic";

export interface AdaptedSchema {
  provider: Provider;
  name: string;
  /** Provider-specific schema object (attach to request body). */
  schema: Record<string, unknown>;
}

export type JsonSchemaNode = Record<string, unknown>;

function stripKeys(obj: unknown, keys: Set<string>): unknown {
  if (Array.isArray(obj)) return obj.map((v) => stripKeys(v, keys));
  if (obj && typeof obj === "object") {
    const out: JsonSchemaNode = {};
    for (const [k, v] of Object.entries(obj as JsonSchemaNode)) {
      if (keys.has(k)) continue;
      out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return obj;
}

function addAdditionalPropertiesFalse(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(addAdditionalPropertiesFalse);
  if (obj && typeof obj === "object") {
    const node = obj as JsonSchemaNode;
    const out: JsonSchemaNode = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = addAdditionalPropertiesFalse(v);
    }
    if (node.type === "object" && out.additionalProperties === undefined) {
      out.additionalProperties = false;
    }
    return out;
  }
  return obj;
}

function inlineDefs(schema: JsonSchemaNode): JsonSchemaNode {
  // zod-to-json-schema emits $ref/$defs by default. Gemini/OpenAI need inlined.
  const defs = (schema.$defs ?? schema.definitions) as Record<string, JsonSchemaNode> | undefined;
  if (!defs) return schema;

  const resolve = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(resolve);
    if (node && typeof node === "object") {
      const obj = node as JsonSchemaNode;
      const ref = obj.$ref as string | undefined;
      if (ref && ref.startsWith("#/$defs/")) {
        const key = ref.replace("#/$defs/", "");
        const target = defs[key];
        if (target) return resolve(target);
      }
      if (ref && ref.startsWith("#/definitions/")) {
        const key = ref.replace("#/definitions/", "");
        const target = defs[key];
        if (target) return resolve(target);
      }
      const out: JsonSchemaNode = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === "$defs" || k === "definitions") continue;
        out[k] = resolve(v);
      }
      return out;
    }
    return node;
  };

  return resolve(schema) as JsonSchemaNode;
}

export function adaptSchema<T>(
  zodSchema: z.ZodType<T>,
  name: string,
  provider: Provider,
): AdaptedSchema {
  const raw = zodToJsonSchema(zodSchema, { name }) as JsonSchemaNode;
  const definitions = (raw.definitions ?? raw.$defs) as Record<string, JsonSchemaNode> | undefined;
  const primary = definitions?.[name] ?? raw;
  const inlined = inlineDefs({ ...primary, $defs: definitions, definitions });

  switch (provider) {
    case "gemini": {
      // Gemini: no $schema, no additionalProperties, no format/examples on plain types.
      const cleaned = stripKeys(inlined, new Set(["$schema", "$ref", "additionalProperties", "definitions", "$defs"]));
      return { provider, name, schema: cleaned as Record<string, unknown> };
    }
    case "openai": {
      // OpenAI strict: needs additionalProperties:false on every object.
      const withAdditional = addAdditionalPropertiesFalse(inlined);
      const cleaned = stripKeys(withAdditional, new Set(["$schema", "definitions", "$defs"]));
      return {
        provider,
        name,
        schema: {
          type: "json_schema",
          json_schema: {
            name,
            schema: cleaned,
            strict: true,
          },
        },
      };
    }
    case "anthropic": {
      // Anthropic tool input_schema is standard JSON Schema draft-07.
      const cleaned = stripKeys(inlined, new Set(["$schema"]));
      return { provider, name, schema: cleaned as Record<string, unknown> };
    }
  }
}

export function adaptSchemaForAll<T>(
  zodSchema: z.ZodType<T>,
  name: string,
): Record<Provider, AdaptedSchema> {
  return {
    gemini: adaptSchema(zodSchema, name, "gemini"),
    openai: adaptSchema(zodSchema, name, "openai"),
    anthropic: adaptSchema(zodSchema, name, "anthropic"),
  };
}

/** Ключи валидации, которых нет в strict-подмножестве OpenAI и в Gemini responseSchema. */
const UNSUPPORTED_VALIDATION = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minLength", "maxLength", "minItems", "maxItems", "pattern", "default", "format",
]);

function makeNullable(node: JsonSchemaNode): JsonSchemaNode {
  // Объект nullable не делаем: Gemini через шлюз отвергает запрос целиком
  // («response_schema.properties[...]: only allowed for OBJECT type», 18.09.2026),
  // потому что properties нельзя держать на типе ["object","null"]. Объект
  // остаётся обязательным — модель вернёт его с null в листьях.
  if (node.type === "object" || node.properties) return node;
  if (Array.isArray(node.anyOf)) {
    return { ...node, anyOf: [...(node.anyOf as JsonSchemaNode[]), { type: "null" }] };
  }
  // enum нельзя расширять "null" типом в поле type — заворачиваем в anyOf.
  if (node.enum) return { anyOf: [node, { type: "null" }] };
  if (typeof node.type === "string") return { ...node, type: [node.type, "null"] };
  return node;
}

/**
 * Strict-подмножество OpenAI: у каждого объекта additionalProperties:false и
 * required со ВСЕМИ ключами; необязательные поля становятся nullable.
 * Модель обязана вернуть все ключи — неизвестные как null (их снимают до Zod).
 */
export function toOpenAIStrictSchema(schema: JsonSchemaNode): JsonSchemaNode {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;

    const obj = node as JsonSchemaNode;
    const out: JsonSchemaNode = {};
    for (const [k, v] of Object.entries(obj)) {
      if (UNSUPPORTED_VALIDATION.has(k)) continue;
      out[k] = walk(v);
    }

    if (out.type === "object" && out.properties) {
      const props = out.properties as JsonSchemaNode;
      const required = new Set((obj.required as string[] | undefined) ?? []);
      const patched: JsonSchemaNode = {};
      for (const [key, value] of Object.entries(props)) {
        const child = value as JsonSchemaNode;
        patched[key] = required.has(key) ? child : makeNullable(child);
      }
      out.properties = patched;
      out.required = Object.keys(patched);
      out.additionalProperties = false;
    }
    return out;
  };
  return walk(schema) as JsonSchemaNode;
}

/** Gemini responseSchema: подмножество OpenAPI 3 — без additionalProperties и anyOf. */
export function toGeminiResponseSchema(schema: JsonSchemaNode): JsonSchemaNode {
  const cleaned = stripKeys(schema, new Set([
    "$schema", "$ref", "additionalProperties", "definitions", "$defs", ...UNSUPPORTED_VALIDATION,
  ]));
  return cleaned as JsonSchemaNode;
}
