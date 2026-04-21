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

type JsonSchemaNode = Record<string, unknown>;

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
