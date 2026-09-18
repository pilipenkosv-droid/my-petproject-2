/**
 * Страховка от регресса 18.09.2026: необязательный объект или массив в схеме
 * становится nullable (`type: ["array","null"]`), и шлюз отвергает запрос
 * целиком — Gemini ругается «items: field predicate failed: $type == Type.ARRAY»,
 * извлечение молча откатывается на json_object. Схему проверяем без вызовов.
 */

import { describe, it, expect } from "vitest";
import { getRulesResponseJsonSchema } from "@/lib/ai/rules-schema";
import { toOpenAIStrictSchema } from "@/lib/pipeline-v6/schema/adapter";

type Node = Record<string, unknown>;

/** Обходит схему, отдавая пару «путь → узел» для каждого узла-объекта. */
function walk(node: unknown, path: string, out: Array<[string, Node]>): void {
  if (Array.isArray(node)) {
    node.forEach((child, n) => walk(child, `${path}[${n}]`, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  out.push([path, node as Node]);
  for (const [key, value] of Object.entries(node as Node)) walk(value, `${path}.${key}`, out);
}

const strict = toOpenAIStrictSchema(getRulesResponseJsonSchema());
const nodes: Array<[string, Node]> = [];
walk(strict, "$", nodes);

function isNullableUnion(node: Node): boolean {
  return Array.isArray(node.type) && (node.type as unknown[]).includes("null");
}

describe("strict-схема извлечения правил", () => {
  it("ни один узел с items или properties не объявлен nullable", () => {
    const bad = nodes
      .filter(([, n]) => isNullableUnion(n) && (n.items !== undefined || n.properties !== undefined))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });

  it("ни один массив не объявлен nullable", () => {
    const bad = nodes
      .filter(([, n]) => isNullableUnion(n) && (n.type as unknown[]).includes("array"))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });

  it("provenance — обязательный объект со всеми шестью секциями-массивами", () => {
    const root = strict as Node;
    expect(root.required).toContain("provenance");

    const provenance = (root.properties as Node).provenance as Node;
    expect(provenance.type).toBe("object");
    const sections = Object.keys(provenance.properties as Node).sort();
    expect(sections).toEqual([
      "additional", "document", "headings", "lists", "specialElements", "text",
    ]);
    expect((provenance.required as string[]).sort()).toEqual(sections);

    for (const section of sections) {
      const node = (provenance.properties as Node)[section] as Node;
      expect(node.type, section).toBe("array");
      expect((node.items as Node).type, section).toBe("integer");
    }
  });
});
