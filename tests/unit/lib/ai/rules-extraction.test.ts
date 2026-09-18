import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ai/rate-limiter", () => ({
  canUseModel: vi.fn().mockResolvedValue(true),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  markModelFailed: vi.fn().mockResolvedValue(undefined),
  logDailySuccess: vi.fn().mockResolvedValue(undefined),
  logDailyFailure: vi.fn().mockResolvedValue(undefined),
}));

import { parseFormattingRules, RulesExtractionError, mergeWithDefaults } from "@/lib/ai/provider";
import { prefilterGuidelines, PREFILTER_THRESHOLD_CHARS } from "@/lib/ai/rules-prefilter";
import { DEFAULT_GOST_RULES } from "@/types/formatting-rules";

/** Перехватываем fetch: проверяем тело запроса к шлюзу и подсовываем ответы. */
const fetchMock = vi.fn();

function lastBody(): Record<string, any> {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse((call![1] as RequestInit).body as string);
}

function gatewayResponse(content: unknown, finishReason = "stop") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: { content: typeof content === "string" ? content : JSON.stringify(content) },
          finish_reason: finishReason,
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    }),
    text: async () => "",
  };
}

/** Валидный ответ по схеме. */
const goodResponse = {
  rules: {
    document: { pageSize: "A4", margins: { top: 20, bottom: 20, left: 30, right: 15 } },
    text: { fontFamily: "Times New Roman", fontSize: 14, lineSpacing: 1.5 },
  },
  confidence: 0.9,
  warnings: [],
  missingRules: [],
};

/** Ответ с выдуманными именами полей — как модель отвечала без схемы. */
const inventedKeysResponse = {
  rules: {
    page_setup: { pageSize: "A4", margins: { top: 20, bottom: 20, left: 30, right: 15 } },
    fonts: { fontFamily: "Arial", font_size: 12 },
    references_and_bibliography: { bibliography: { style: "gost" } },
  },
  confidence: 0.7,
  warnings: [],
  missingRules: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  delete process.env.GEMINI_API_KEY;
  delete process.env.BENCH_FORCE_MODEL;
  delete process.env.CLAUDE_CLI_ENABLED;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("схема в запросе", () => {
  it("уходит в response_format.json_schema со strict и без $ref", async () => {
    fetchMock.mockResolvedValue(gatewayResponse(goodResponse));

    await parseFormattingRules("текст методички");

    const body = lastBody();
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe("formatting_rules_response");
    const schema = JSON.stringify(body.response_format.json_schema.schema);
    expect(schema).not.toContain("$ref");
    expect(body.response_format.json_schema.schema.properties.rules).toBeDefined();
  });

  it("strict-схема требует все ключи и запрещает лишние", async () => {
    fetchMock.mockResolvedValue(gatewayResponse(goodResponse));
    await parseFormattingRules("текст методички");

    const root = lastBody().response_format.json_schema.schema;
    expect(root.additionalProperties).toBe(false);
    expect(root.required.sort()).toEqual(["confidence", "missingRules", "rules", "warnings"]);
    // Необязательная секция стала nullable, но осталась в required.
    const rules = root.properties.rules;
    expect(rules.required).toContain("additional");
  });

  it("схема продублирована в тексте промпта", async () => {
    fetchMock.mockResolvedValue(gatewayResponse(goodResponse));
    await parseFormattingRules("текст методички");

    const userPrompt = lastBody().messages[1].content as string;
    expect(userPrompt).toContain("СХЕМА ОТВЕТА");
    expect(userPrompt).toContain('"paragraphIndent"');
    expect(userPrompt).toContain("specialElements");
  });

  it("поднятый потолок ответа = 8000 токенов", async () => {
    fetchMock.mockResolvedValue(gatewayResponse(goodResponse));
    await parseFormattingRules("текст методички");

    expect(lastBody().max_tokens).toBe(8000);
  });
});

describe("шлюз не принял json_schema", () => {
  function rejection(message: string) {
    return { ok: false, status: 400, text: async () => message, json: async () => ({}) };
  }

  it("400 про response_format → тот же вызов повторяется с json_object", async () => {
    fetchMock
      .mockResolvedValueOnce(rejection('{"error":{"message":"response_format json_schema is not supported"}}'))
      .mockResolvedValueOnce(gatewayResponse(goodResponse));

    const res = await parseFormattingRules("текст методички");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Повтор ушёл к той же модели, не к следующей в цепочке failover.
    expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).response_format.type)
      .toBe("json_schema");
    expect(lastBody().response_format).toEqual({ type: "json_object" });
    // Схема осталась в промпте — второй пояс работает.
    expect(lastBody().messages[1].content as string).toContain("СХЕМА ОТВЕТА");
    expect(res.schemaMode).toBe("json_object");
    expect(res.rules.text?.fontFamily).toBe("Times New Roman");
  });

  it("успешный json_schema не откатывается", async () => {
    fetchMock.mockResolvedValue(gatewayResponse(goodResponse));

    const res = await parseFormattingRules("текст методички");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.schemaMode).toBe("json_schema");
  });

  it("400 не про схему откат не запускает", async () => {
    fetchMock.mockResolvedValue(rejection('{"error":{"message":"invalid api key"}}'));

    const err = await parseFormattingRules("текст методички").catch((e) => e);

    // По одному вызову на каждую модель цепочки, без повторов с json_object.
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.response_format.type).toBe("json_schema");
    }
    expect(err).toBeInstanceOf(RulesExtractionError);
  });
});

describe("разбор ответа", () => {
  it("валидный ответ разбирается без нормализации", async () => {
    fetchMock.mockResolvedValue(gatewayResponse(goodResponse));

    const res = await parseFormattingRules("текст методички");

    expect(res.normalized).toBe(false);
    expect(res.confidence).toBe(0.9);
    expect(res.rules.text?.fontFamily).toBe("Times New Roman");
  });

  it("выдуманные имена полей нормализуются и проходят схему", async () => {
    fetchMock.mockResolvedValue(gatewayResponse(inventedKeysResponse));

    const res = await parseFormattingRules("текст методички");

    expect(res.normalized).toBe(true);
    expect(res.rules.document?.pageSize).toBe("A4");
    expect(res.rules.text?.fontFamily).toBe("Arial");
    expect(res.rules.text?.fontSize).toBe(12);
    expect(res.rules.specialElements?.bibliography?.style).toBe("gost");
  });

  it("ответ в ограждениях ```json разбирается", async () => {
    fetchMock.mockResolvedValue(
      gatewayResponse("```json\n" + JSON.stringify(goodResponse) + "\n```")
    );

    const res = await parseFormattingRules("текст методички");

    expect(res.rules.text?.fontSize).toBe(14);
  });

  it("null-значения снимаются, а не ломают разбор", async () => {
    fetchMock.mockResolvedValue(
      gatewayResponse({
        rules: {
          document: { pageSize: "A4", margins: null, orientation: null },
          text: { fontFamily: null, fontSize: 14, lineSpacing: null },
          headings: null,
        },
        confidence: 0.6,
        warnings: null,
        missingRules: null,
      })
    );

    const res = await parseFormattingRules("текст методички");

    expect(res.rules.document?.pageSize).toBe("A4");
    expect(res.rules.text?.fontSize).toBe(14);
    expect(res.warnings).toEqual([]);
  });

  it("мусор → RulesExtractionError(schema_mismatch), а не правила по ГОСТ", async () => {
    fetchMock.mockResolvedValue(gatewayResponse({ answer: "не знаю", items: [1, 2, 3] }));

    const err = await parseFormattingRules("текст методички").catch((e) => e);

    expect(err).toBeInstanceOf(RulesExtractionError);
    expect(err.reason).toBe("schema_mismatch");
  });

  it("ответ без единого правила — тоже ошибка, а не пустые правила", async () => {
    fetchMock.mockResolvedValue(
      gatewayResponse({ rules: {}, confidence: 0.9, warnings: [], missingRules: [] })
    );

    const err = await parseFormattingRules("текст методички").catch((e) => e);

    expect(err).toBeInstanceOf(RulesExtractionError);
    expect(err.reason).toBe("schema_mismatch");
  });

  it("недоступность провайдера → RulesExtractionError, а не ГОСТ", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "upstream boom",
      json: async () => ({}),
    });

    const err = await parseFormattingRules("текст методички").catch((e) => e);

    expect(err).toBeInstanceOf(RulesExtractionError);
    expect(["provider", "timeout"]).toContain(err.reason);
  });
});

describe("обрыв по лимиту токенов", () => {
  it("finish_reason=length → компактный повтор → успех", async () => {
    fetchMock
      .mockResolvedValueOnce(gatewayResponse('{"rules":{"document":{"pageSi', "length"))
      .mockResolvedValueOnce(gatewayResponse(goodResponse));

    const res = await parseFormattingRules("текст методички");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.retriedCompact).toBe(true);
    expect((lastBody().messages[1].content as string)).toContain("КОМПАКТНО");
  });

  it("повторный обрыв → RulesExtractionError(truncated), ровно два вызова", async () => {
    fetchMock.mockResolvedValue(gatewayResponse('{"rules":{"document', "length"));

    const err = await parseFormattingRules("текст методички").catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(RulesExtractionError);
    expect(err.reason).toBe("truncated");
  });
});

describe("предфильтр длинных методичек", () => {
  const formatting =
    "Основной текст работы набирается шрифтом Times New Roman, кегль 14 пт, " +
    "межстрочный интервал полуторный.";
  const procedure =
    "Порядок защиты выпускной квалификационной работы определяется кафедрой, " +
    "защита проводится публично в присутствии комиссии.";

  function longText(): string {
    const filler = Array.from({ length: 600 }, (_, i) => `${procedure} Пункт ${i}.`);
    return [formatting, ...filler].join("\n\n");
  }

  it("короткую методичку не трогает", () => {
    const res = prefilterGuidelines("Шрифт Times New Roman 14 пт.");
    expect(res.applied).toBe(false);
    expect(res.droppedChars).toBe(0);
  });

  it("на длинной оставляет абзацы про оформление и выбрасывает «порядок защиты»", () => {
    const text = longText();
    expect(text.length).toBeGreaterThan(PREFILTER_THRESHOLD_CHARS);

    const res = prefilterGuidelines(text);

    expect(res.applied).toBe(true);
    expect(res.text).toContain("Times New Roman");
    expect(res.droppedChars).toBeGreaterThan(0);
    expect(res.text.length).toBeLessThan(text.length / 2);
  });

  it("отфильтрованный текст уезжает в модель, а объём снятого попадает в результат", async () => {
    fetchMock.mockResolvedValue(gatewayResponse(goodResponse));

    const res = await parseFormattingRules(longText());

    expect(res.droppedChars).toBeGreaterThan(0);
    expect((lastBody().messages[1].content as string).length).toBeLessThan(longText().length);
  });
});

describe("mergeWithDefaults", () => {
  it("закрывает только отсутствующие листья, не заменяя секции целиком", () => {
    const merged = mergeWithDefaults({
      text: { fontSize: 13 },
      specialElements: { figures: { captionPrefix: "Рис." } },
    });

    expect(merged.text.fontSize).toBe(13);
    expect(merged.text.fontFamily).toBe(DEFAULT_GOST_RULES.text.fontFamily);
    expect(merged.specialElements.figures?.captionPrefix).toBe("Рис.");
    expect(merged.specialElements.figures?.captionPosition).toBe(
      DEFAULT_GOST_RULES.specialElements.figures?.captionPosition
    );
    expect(merged.specialElements.tables).toEqual(DEFAULT_GOST_RULES.specialElements.tables);
  });
});

describe("сообщение пользователю", () => {
  it("роут получает текст без технических деталей", async () => {
    const { rulesExtractionMessage } = await import("@/lib/ai/provider");
    const message = rulesExtractionMessage(
      new RulesExtractionError("schema_mismatch", "ZodError: rules.text.fontSize")
    );

    expect(message).toContain("Не удалось извлечь правила из методички");
    expect(message).toContain("выберите режим ГОСТ");
    expect(message).not.toContain("ZodError");
  });
});
