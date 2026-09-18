import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ai/rate-limiter", () => ({
  canUseModel: vi.fn().mockResolvedValue(true),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  markModelFailed: vi.fn().mockResolvedValue(undefined),
  logDailySuccess: vi.fn().mockResolvedValue(undefined),
  logDailyFailure: vi.fn().mockResolvedValue(undefined),
}));

import { callAI } from "@/lib/ai/gateway";
import { parseFormattingRules } from "@/lib/ai/provider";

/**
 * Перехватываем fetch: проверяем ИМЕННО тело запроса к AI Gateway.
 * Экспорт Gateway за 17–18.09 показал, что extraParams.providerOptions
 * игнорируется — размышления должны уезжать в поле верхнего уровня `reasoning`.
 */
const fetchMock = vi.fn();
function lastBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse((call![1] as RequestInit).body as string);
}

function okResponse(json: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(json) }, finish_reason: "stop" }],
    }),
    text: async () => "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  delete process.env.GEMINI_API_KEY;
  delete process.env.BENCH_FORCE_MODEL;
  delete process.env.CLAUDE_CLI_ENABLED;
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(okResponse({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("тело запроса к AI Gateway: выключение размышлений", () => {
  it("thinking: false уходит как reasoning.enabled=false", async () => {
    await callAI({ systemPrompt: "s", userPrompt: "u", thinking: false });

    expect(lastBody().reasoning).toEqual({ enabled: false });
  });

  it("числовой бюджет уходит как reasoning.max_tokens", async () => {
    await callAI({ systemPrompt: "s", userPrompt: "u", thinking: 512 });

    expect(lastBody().reasoning).toEqual({ max_tokens: 512 });
  });

  it("без thinking поле reasoning не отправляется", async () => {
    await callAI({ systemPrompt: "s", userPrompt: "u" });

    expect(lastBody()).not.toHaveProperty("reasoning");
  });

  it("providerOptions из реестра больше не отправляется — Gateway его игнорировал", async () => {
    await callAI({ systemPrompt: "s", userPrompt: "u", thinking: false });

    expect(lastBody()).not.toHaveProperty("providerOptions");
  });
});

describe("места вызова с извлечением", () => {
  it("parseFormattingRules выключает размышления и ограничивает ответ", async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        rules: { text: { fontFamily: "Times New Roman", fontSize: 14 } },
        confidence: 0.9,
        warnings: [],
        missingRules: [],
      })
    );

    await parseFormattingRules("текст методички");

    const body = lastBody();
    expect(body.reasoning).toEqual({ enabled: false });
    expect(body.max_tokens).toBe(8000);
  });

  it("разметка блоков выключает размышления", async () => {
    const { parseChunk } = await import("@/lib/ai/document-block-parse-chunk");
    fetchMock.mockResolvedValue(okResponse({ blocks: [], warnings: [] }));

    await parseChunk([{ index: 0, text: "Текст абзаца" }]);

    expect(lastBody().reasoning).toEqual({ enabled: false });
  });
});
