/**
 * Политика длины при извлечении правил: короткая методичка уходит целиком,
 * длинная — через ретрив, и тогда модель просят вернуть provenance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ai/rate-limiter", () => ({
  canUseModel: vi.fn().mockResolvedValue(true),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  markModelFailed: vi.fn().mockResolvedValue(undefined),
  logDailySuccess: vi.fn().mockResolvedValue(undefined),
  logDailyFailure: vi.fn().mockResolvedValue(undefined),
}));

import { parseFormattingRules } from "@/lib/ai/provider";
import { RULES_FULLTEXT_MAX_CHARS } from "@/lib/ai/rules-context";
import { TOPICS } from "@/lib/ai/guidelines/topics";

const fetchMock = vi.fn();

const modelAnswer = {
  rules: {
    text: { fontFamily: "Times New Roman", fontSize: 14, lineSpacing: 1.5 },
  },
  confidence: 0.9,
  warnings: [],
  missingRules: [],
  provenance: { text: [1, 2] },
};

function chatResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(modelAnswer) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    }),
    text: async () => "",
  };
}

function embeddingsResponse(inputs: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: inputs.map((text, index) => ({
        index,
        // Единственная координата — «есть ли слово об оформлении».
        embedding: [/шрифт|интервал|поля|заголов|таблиц/i.test(text) ? 1 : 0.01, 0.5],
      })),
      usage: { prompt_tokens: 10 },
    }),
    text: async () => "",
  };
}

function rerankResponse(documents: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: documents.map((_, index) => ({ index, relevance_score: 1 - index / 100 })),
      usage: { total_tokens: 100 },
    }),
    text: async () => "",
  };
}

function callsTo(suffix: string) {
  return fetchMock.mock.calls.filter((c) => String(c[0]).endsWith(suffix));
}

function lastChatPrompt(): string {
  const call = callsTo("/chat/completions").at(-1)!;
  return JSON.parse((call[1] as RequestInit).body as string).messages[1].content as string;
}

/** Методичка заданной длины: половина абзацев про оформление, половина — нет. */
function guidelines(chars: number): string {
  const blocks: string[] = [];
  let n = 0;
  while (blocks.join("\n\n").length < chars) {
    blocks.push(
      n % 2 === 0
        ? `Пункт ${n}. Шрифт основного текста Times New Roman, межстрочный интервал полуторный, поля страницы заданы методичкой.`
        : `Пункт ${n}. Работа сдаётся на кафедру в установленный срок вместе с отзывом научного руководителя и справкой.`
    );
    n++;
  }
  return blocks.join("\n\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  delete process.env.GEMINI_API_KEY;
  delete process.env.BENCH_FORCE_MODEL;
  delete process.env.CLAUDE_CLI_ENABLED;
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    if (String(url).endsWith("/embeddings")) return embeddingsResponse(body.input);
    if (String(url).endsWith("/rerank")) return rerankResponse(body.documents);
    return chatResponse();
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("порог полного текста", () => {
  it("по умолчанию 25 000 символов", () => {
    expect(RULES_FULLTEXT_MAX_CHARS).toBe(25_000);
  });

  it("короткая методичка уходит целиком, без вызовов ретрива", async () => {
    const text = guidelines(RULES_FULLTEXT_MAX_CHARS - 2_000);

    const result = await parseFormattingRules(text);

    expect(callsTo("/embeddings")).toHaveLength(0);
    expect(callsTo("/rerank")).toHaveLength(0);
    expect(result.retrieval).toBeUndefined();
    expect(result.droppedChars).toBe(0);
    const prompt = lastChatPrompt();
    expect(prompt).toContain(text.slice(0, 120));
    // Схема (а в ней и поле provenance) в промпте есть всегда — не должно быть
    // инструкции его заполнять и меток фрагментов.
    expect(prompt).not.toContain("- provenance: объект");
    expect(prompt).not.toContain("отобранные из неё фрагменты");
    expect(prompt).not.toContain("[u0]");
  });

  it("длинная методичка идёт через ретрив, в промпте метки [uN] и просьба о provenance", async () => {
    const text = guidelines(RULES_FULLTEXT_MAX_CHARS + 15_000);

    const result = await parseFormattingRules(text);

    expect(callsTo("/embeddings").length).toBeGreaterThan(0);
    expect(callsTo("/rerank")).toHaveLength(TOPICS.length);
    expect(result.retrieval?.mode).toBe("rerank");
    expect(result.retrieval!.charsOut).toBeLessThan(result.retrieval!.charsIn);
    expect(result.droppedChars).toBeGreaterThan(0);

    const prompt = lastChatPrompt();
    expect(prompt).toMatch(/\[u\d+\]/);
    expect(prompt).toContain("- provenance: объект");
    expect(prompt).toContain("отобранные из неё фрагменты");
    expect(result.provenance).toEqual({ text: [1, 2] });
  }, 20_000);

  it("порог переопределяется переменной окружения", async () => {
    vi.resetModules();
    process.env.RULES_FULLTEXT_MAX_CHARS = "500";
    const { RULES_FULLTEXT_MAX_CHARS: patched } = await import("@/lib/ai/rules-context");
    expect(patched).toBe(500);
    delete process.env.RULES_FULLTEXT_MAX_CHARS;
    vi.resetModules();
  });
});

describe("провенанс с вложенными объектами", () => {
  it("вложенный объект секции сплющивается в список номеров", async () => {
    const nested = {
      ...modelAnswer,
      provenance: {
        text: [12, 13],
        specialElements: { tables: [40, 41], figures: [41, 7] },
        additional: { pageNumbering: 3 },
      },
    };
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (String(url).endsWith("/embeddings")) return embeddingsResponse(body.input);
      if (String(url).endsWith("/rerank")) return rerankResponse(body.documents);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(nested) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        }),
        text: async () => "",
      };
    });

    const result = await parseFormattingRules(guidelines(RULES_FULLTEXT_MAX_CHARS + 5_000));

    expect(result.provenance).toEqual({
      text: [12, 13],
      specialElements: [7, 40, 41],
      additional: [3],
    });
  }, 20_000);
});
