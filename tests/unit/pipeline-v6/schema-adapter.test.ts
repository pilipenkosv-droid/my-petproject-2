import { describe, it, expect } from "vitest";
import { z } from "zod";
import { adaptSchema, adaptSchemaForAll } from "../../../src/lib/pipeline-v6/schema/adapter";

const SectionSchema = z.object({
  type: z.enum(["heading", "paragraph", "list"]),
  level: z.number().int().min(1).max(3).optional(),
  text: z.string(),
});

const DocumentSchema = z.object({
  title: z.string(),
  sections: z.array(SectionSchema),
});

describe("adaptSchema", () => {
  it("strips additionalProperties + $ref for gemini", () => {
    const adapted = adaptSchema(DocumentSchema, "Document", "gemini");
    const json = JSON.stringify(adapted.schema);
    expect(json).not.toContain("additionalProperties");
    expect(json).not.toContain("$ref");
    expect(json).not.toContain("$schema");
    expect(adapted.schema).toMatchObject({ type: "object" });
  });

  it("wraps openai schema in json_schema + strict:true", () => {
    const adapted = adaptSchema(DocumentSchema, "Document", "openai");
    expect(adapted.schema.type).toBe("json_schema");
    const container = adapted.schema.json_schema as { strict: boolean; schema: Record<string, unknown> };
    expect(container.strict).toBe(true);
    const nestedJson = JSON.stringify(container.schema);
    expect(nestedJson).toContain('"additionalProperties":false');
    expect(nestedJson).not.toContain("$ref");
  });

  it("keeps anthropic schema close to draft-07", () => {
    const adapted = adaptSchema(DocumentSchema, "Document", "anthropic");
    expect(adapted.schema.type).toBe("object");
    expect(JSON.stringify(adapted.schema)).not.toContain("$schema");
  });

  it("adaptSchemaForAll emits all three providers", () => {
    const all = adaptSchemaForAll(DocumentSchema, "Document");
    expect(Object.keys(all).sort()).toEqual(["anthropic", "gemini", "openai"]);
  });
});
