import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Мокаем gateway: parseDocumentBlocks ходит в AI только через callAI.
const callAI = vi.fn();
vi.mock("@/lib/ai/gateway", () => ({
  callAI: (...args: unknown[]) => callAI(...args),
  AllModelsUnavailableError: class extends Error {},
}));

// Рейт-лимитер пишет в Supabase — не нужен в юнит-тесте.
vi.mock("@/lib/ai/rate-limiter", () => ({
  recordUsage: vi.fn().mockResolvedValue(undefined),
  canUseModel: vi.fn().mockResolvedValue(true),
  markModelFailed: vi.fn().mockResolvedValue(undefined),
  logDailySuccess: vi.fn().mockResolvedValue(undefined),
  logDailyFailure: vi.fn().mockResolvedValue(undefined),
}));

import { parseDocumentBlocks } from "@/lib/ai/document-block-markup";

/** Параграфы, которые rule-based пре-классификация НЕ забирает (нужен AI). */
function makeParagraphs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    text: `Обычный текст абзаца номер ${i}, достаточно длинный чтобы не попасть под правила пре-классификации и уйти в AI.`,
    style: "Normal",
  }));
}

function markupResponse(paragraphs: Array<{ index: number }>) {
  return {
    json: {
      blocks: paragraphs.map((p) => ({
        paragraphIndex: p.index,
        blockType: "body_text",
        confidence: 0.9,
      })),
      warnings: [],
    },
    modelId: "test-model",
    modelName: "Test Model",
  };
}

describe("markup budget in parseDocumentBlocks", () => {
  beforeEach(() => {
    callAI.mockReset();
    vi.stubEnv("MARKUP_BUDGET_MS", "300");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("respects the budget and falls back to rule-based markup", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    // AI висит дольше бюджета, а потом падает — stragglers не должны всплыть.
    callAI.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("slow model")), 3000).unref?.();
        })
    );

    const paragraphs = makeParagraphs(20);
    const started = Date.now();
    const result = await parseDocumentBlocks(paragraphs);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(300 + 700);
    expect(result.markupDegraded).toBe(true);
    expect(result.markupDegradedChunks).toBe(1);
    expect(result.blocks).toHaveLength(20);
    expect(result.blocks.every((b) => b.blockType !== "unknown")).toBe(true);
    expect(result.blocks.every((b) => b.blockType === "body_text")).toBe(true);

    // Даём времени возможному «хвосту» всплыть.
    await new Promise((r) => setTimeout(r, 50));
    process.off("unhandledRejection", onUnhandled);
    expect(unhandled).toEqual([]);
  });

  it("does not degrade when the model answers inside the budget", async () => {
    const paragraphs = makeParagraphs(20);
    callAI.mockResolvedValue(markupResponse(paragraphs));

    const result = await parseDocumentBlocks(paragraphs);

    expect(result.markupDegraded).toBe(false);
    expect(result.markupDegradedChunks).toBe(0);
    expect(result.blocks).toHaveLength(20);
    expect(callAI).toHaveBeenCalled();
  });
});
