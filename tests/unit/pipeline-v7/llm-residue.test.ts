import { describe, it, expect, vi } from "vitest";

const callAI = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/gateway", () => ({ callAI }));

import { classifyResidueWithLlm } from "@/lib/pipeline-v7/classify/llm";
import { mergeLlmRoles, makeLlmHook } from "@/lib/pipeline-v7/classify/merge";
import { emptyHistogram, type ClassificationResult, type ClassifiedParagraph, type Role }
  from "@/lib/pipeline-v7/classify/types";
import type { OrderedXmlNode } from "@/lib/xml/docx-xml";

/** A paragraph shaped like a candidate: bold, short, no role from T0. */
function para(text: string, over: Partial<ClassifiedParagraph> = {}): ClassifiedParagraph {
  return {
    node: { name: "w:p", attrs: {}, children: [] } as unknown as OrderedXmlNode,
    path: `/w:body/w:p[${Math.random().toString(36).slice(2, 7)}]`,
    part: "word/document.xml",
    role: "unknown",
    confidence: 0,
    source: "none",
    text,
    features: {
      keepNext: false,
      pageBreakBefore: false,
      hasPageBreakRun: false,
      boldAll: true,
      capsRatio: 0,
      hasMath: false,
      hasDrawing: false,
    },
    ...over,
  };
}

function result(list: ClassifiedParagraph[]): ClassificationResult {
  const histogram = emptyHistogram();
  for (const cp of list) histogram[cp.role] += 1;
  return { byNode: new WeakMap(), list, histogram, warnings: [], suspect: false };
}

/** Enough plain body so the suspect guard never fires on a small fixture. */
function filler(n = 20): ClassifiedParagraph[] {
  return Array.from({ length: n }, (_, i) =>
    para(`Обычное предложение номер ${i + 1} в основном тексте работы.`, {
      role: "body",
      confidence: 1,
      source: "style",
      features: { ...para("x").features!, boldAll: false },
    }),
  );
}

/** The global afterEach restores mocks, so each test arms callAI itself. */
function respond(assignments: unknown[]) {
  callAI.mockImplementation(async () => ({ json: { assignments }, modelId: "m", modelName: "M" }));
}

describe("residue merge", () => {
  it("keeps the T0 role when the model is not confident, and reports it", async () => {
    const target = para("Спорная строка");
    const r = result([target, ...filler()]);
    respond([{ i: 0, role: "heading_L1", confidence: 0.4 }]);

    const merged = mergeLlmRoles(r, await classifyResidueWithLlm(r));
    expect(target.role).toBe("unknown");
    expect(merged.llm.assigned).toBe(0);
    expect(merged.lowConfidence).toHaveLength(1);
    expect(merged.lowConfidence[0].text).toBe("Спорная строка");
  });

  it("drops an index the model invented", async () => {
    const target = para("ВВЕДЕНИЕ");
    const r = result([target, ...filler()]);
    respond([
      { i: 99, role: "heading_L1", confidence: 0.95 },
      { i: 0, role: "heading_L1", confidence: 0.95 },
    ]);

    const merged = mergeLlmRoles(r, await classifyResidueWithLlm(r));
    expect(target.role).toBe("heading_L1");
    expect(merged.llm.assigned).toBe(1);
    expect(merged.warnings.some((w) => w.includes("out-of-range index 99"))).toBe(true);
  });

  it("takes the first opinion when the model answers the same index twice", async () => {
    const target = para("ЗАКЛЮЧЕНИЕ");
    const r = result([target, ...filler()]);
    respond([
      { i: 0, role: "heading_L1", confidence: 0.95 },
      { i: 0, role: "body", confidence: 0.99 },
    ]);

    const merged = mergeLlmRoles(r, await classifyResidueWithLlm(r));
    expect(target.role).toBe("heading_L1");
    expect(merged.warnings.some((w) => w.includes("duplicate index 0"))).toBe(true);
  });

  it("never overrides a paragraph T0 resolved with high confidence", async () => {
    // T0 confidence 0.9 keeps candidatesForLlm away, so feed the batch directly.
    const target = para("Таблица 1 — Показатели", {
      role: "table_caption",
      confidence: 0.9,
      source: "caption-re",
    });
    const r = result([target, ...filler()]);

    const merged = mergeLlmRoles(r, {
      batches: [{ items: [target], assignments: [{ i: 0, role: "heading_L2" as Role, confidence: 0.99 }] }],
      candidates: 1,
      requests: 1,
      skipped: 0,
      skippedPaths: [],
      degraded: false,
      ms: 1,
      errors: [],
    });
    expect(target.role).toBe("table_caption");
    expect(target.llm?.role).toBe("heading_L2");
    expect(merged.llm.assigned).toBe(0);
  });

  it("degrades instead of throwing when every model fails", async () => {
    const target = para("ВВЕДЕНИЕ");
    const r = result([target, ...filler()]);
    callAI.mockImplementation(async () => {
      throw new Error("Все AI-модели недоступны: лимит исчерпан");
    });

    const residue = await classifyResidueWithLlm(r);
    expect(residue.degraded).toBe(true);
    expect(residue.batches).toHaveLength(0);
    const merged = mergeLlmRoles(r, residue);
    expect(target.role).toBe("unknown");
    expect(merged.llm.degraded).toBe(true);
  });

  it("returns within the total budget when the model hangs", async () => {
    const list = Array.from({ length: 300 }, (_, i) => para(`КАНДИДАТ ${i}`));
    const r = result([...list, ...filler()]);
    callAI.mockImplementation(() => new Promise(() => {}));

    const started = Date.now();
    const residue = await classifyResidueWithLlm(r, { totalBudgetMs: 300 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(residue.degraded).toBe(true);
    expect(residue.batches).toHaveLength(0);
  });

  it("caps candidates at 8 requests of 80", async () => {
    const list = Array.from({ length: 1000 }, (_, i) => para(`КАНДИДАТ ${i}`));
    const r = result([...list, ...filler()]);
    respond([]);
    callAI.mockClear();

    const residue = await classifyResidueWithLlm(r);
    expect(residue.candidates).toBe(1000);
    expect(residue.requests).toBe(8);
    expect(callAI).toHaveBeenCalledTimes(8);
    expect(residue.skipped).toBe(400);
    const sizes = callAI.mock.calls.map((c) => c[0].userPrompt.split("\n").filter((l: string) => l.startsWith("{\"i\":")).length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(80);
  });

  it("exposes a hook the orchestrator can call", async () => {
    const target = para("ВВЕДЕНИЕ");
    const r = result([target, ...filler()]);
    respond([{ i: 0, role: "heading_L1", confidence: 0.95 }]);

    const out = await makeLlmHook()(r);
    expect(out.histogram.heading_L1).toBe(1);
    expect(target.role).toBe("heading_L1");
  });
});
