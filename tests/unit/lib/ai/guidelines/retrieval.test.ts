import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  selectRelevantUnits,
  buildRetrievalContext,
  TOP_PER_TOPIC,
  TOP_PER_TOPIC_NO_RERANK,
} from "@/lib/ai/guidelines/retrieval";
import { segmentGuidelines, type Unit } from "@/lib/ai/guidelines/segment";
import { TOPICS } from "@/lib/ai/guidelines/topics";

/**
 * Синтетическая методичка на ~40k символов: по одному эталонному абзацу
 * на каждую из 14 тем плюс наполнитель, в котором ничего нужного нет.
 * Эталонный абзац помечен маркером [[<тема>]] — его видит мок эмбеддингов.
 */
function goldPhrase(topic: string): string {
  return `Эталон темы ${topic}: конкретное требование методички, номер ${topic.length}.`;
}

function buildGuidelines(): { text: string; gold: Map<string, string> } {
  const gold = new Map<string, string>();
  const blocks: string[] = [];
  TOPICS.forEach((topic, n) => {
    for (let f = 0; f < 12; f++) {
      blocks.push(
        `Раздел ${n}.${f}. Общие положения о порядке подготовки и защиты работы, ` +
          `а также о сроках сдачи материалов на кафедру и порядке рецензирования.`
      );
    }
    const phrase = goldPhrase(topic.key);
    gold.set(topic.key, phrase);
    blocks.push(`[[${topic.key}]] ${phrase}`);
  });
  // Добираем длину до 40k наполнителем без единого признака оформления.
  let text = blocks.join("\n\n");
  let n = 0;
  while (text.length < 40_000) {
    text += `\n\nДополнительное положение ${n}: работа сдаётся в срок, установленный кафедрой.`;
    n++;
  }
  return { text, gold };
}

const { text: GUIDELINES, gold: GOLD } = buildGuidelines();

/** Вектор размерности «тем + 1»: единица в координате темы, фон в последней. */
function fakeVector(input: string): number[] {
  const v = new Array(TOPICS.length + 1).fill(0);
  v[TOPICS.length] = 0.01;
  TOPICS.forEach((t, k) => {
    if (input.includes(`[[${t.key}]]`) || t.queries.includes(input)) v[k] = 1;
  });
  return v;
}

const fetchMock = vi.fn();

function embeddingsOk(inputs: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: inputs.map((text, index) => ({ index, embedding: fakeVector(text) })),
      usage: { prompt_tokens: inputs.length * 20 },
    }),
    text: async () => "",
  };
}

/** Реранк сохраняет порядок кандидатов: проверяем сборку, а не модель. */
function rerankOk(documents: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: documents.map((_, index) => ({ index, relevance_score: 1 - index / 100 })),
      usage: { total_tokens: 500 },
    }),
    text: async () => "",
  };
}

function serverError() {
  return { ok: false, status: 500, json: async () => ({}), text: async () => "gateway down" };
}

function routeFetch(handlers: { embeddings?: () => unknown; rerank?: () => unknown } = {}) {
  return async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    if (String(url).endsWith("/embeddings")) {
      return handlers.embeddings ? handlers.embeddings() : embeddingsOk(body.input);
    }
    return handlers.rerank ? handlers.rerank() : rerankOk(body.documents);
  };
}

function unitWith(units: Unit[], phrase: string): Unit | undefined {
  return units.find((u) => u.text.includes(phrase));
}

describe("selectRelevantUnits", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_GATEWAY_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("находит эталонные фрагменты всех 14 тем в методичке на 40k символов", async () => {
    fetchMock.mockImplementation(routeFetch());
    const units = segmentGuidelines(GUIDELINES);

    const result = await selectRelevantUnits(units, { budgetMs: 60_000 });

    expect(result.stats.mode).toBe("rerank");
    for (const topic of TOPICS) {
      const phrase = GOLD.get(topic.key)!;
      const hit = unitWith(units, phrase);
      expect(hit, `не найдена единица темы ${topic.key}`).toBeDefined();
      expect(result.byTopic[topic.key]).toContain(hit!.i);
      expect(result.byTopic[topic.key].length).toBeLessThanOrEqual(TOP_PER_TOPIC);
      expect(unitWith(result.units, phrase)).toBeDefined();
    }
  });

  it("возвращает единицы в порядке документа и считает статистику", async () => {
    fetchMock.mockImplementation(routeFetch());
    const units = segmentGuidelines(GUIDELINES);

    const result = await selectRelevantUnits(units, { budgetMs: 60_000 });

    const ids = result.units.map((u) => u.i);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(result.stats.unitsTotal).toBe(units.length);
    expect(result.stats.unitsSelected).toBe(result.units.length);
    expect(result.stats.charsOut).toBeLessThan(result.stats.charsIn);
    expect(result.stats.costUsd).toBeGreaterThan(0);
  });

  it("без ключа шлюза уходит на регулярки и не делает вызовов", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const result = await selectRelevantUnits(segmentGuidelines(GUIDELINES));

    expect(result.stats.mode).toBe("keyword");
    expect(result.stats.fallbackReason).toContain("AI_GATEWAY_API_KEY");
    expect(result.units.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("исчерпанный бюджет — регулярки без единого вызова", async () => {
    const result = await selectRelevantUnits(segmentGuidelines(GUIDELINES), {
      deadline: Date.now() - 1,
    });

    expect(result.stats.mode).toBe("keyword");
    expect(result.stats.fallbackReason).toContain("бюджет");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("падение эмбеддингов (500) — регулярки", async () => {
    fetchMock.mockImplementation(routeFetch({ embeddings: serverError }));

    const result = await selectRelevantUnits(segmentGuidelines(GUIDELINES), { budgetMs: 60_000 });

    expect(result.stats.mode).toBe("keyword");
    expect(result.stats.fallbackReason).toContain("500");
    expect(result.units.length).toBeGreaterThan(0);
  }, 20_000);

  it("падение реранка (500) — остаёмся на эмбеддингах, top-8 на тему", async () => {
    fetchMock.mockImplementation(routeFetch({ rerank: serverError }));
    const units = segmentGuidelines(GUIDELINES);

    const result = await selectRelevantUnits(units, { budgetMs: 60_000 });

    expect(result.stats.mode).toBe("embeddings");
    expect(result.stats.fallbackReason).toContain("500");
    for (const topic of TOPICS) {
      expect(result.byTopic[topic.key].length).toBeLessThanOrEqual(TOP_PER_TOPIC_NO_RERANK);
      expect(result.byTopic[topic.key]).toContain(unitWith(units, GOLD.get(topic.key)!)!.i);
    }
  }, 20_000);
});

describe("buildRetrievalContext", () => {
  it("помечает каждый фрагмент идентификатором [uN]", () => {
    const context = buildRetrievalContext([
      { i: 3, text: "Шрифт Times New Roman.", section: "" },
      { i: 40, text: "Поля: левое 30 мм.", section: "" },
    ]);
    expect(context).toBe("[u3] Шрифт Times New Roman.\n\n[u40] Поля: левое 30 мм.");
  });
});

describe("параллельные батчи эмбеддингов", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_GATEWAY_API_KEY = "test-key";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("батчи уходят волнами, а не по одному", async () => {
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (!String(url).endsWith("/embeddings")) return rerankOk(body.documents);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return embeddingsOk(body.input);
    });

    const units = segmentGuidelines(GUIDELINES);
    expect(units.length).toBeGreaterThan(64 * 2);
    await selectRelevantUnits(units, { budgetMs: 60_000 });

    expect(peak).toBeGreaterThan(1);
  });

  it("стоимость успевших батчей не теряется при падении следующего", async () => {
    let call = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (!String(url).endsWith("/embeddings")) return rerankOk(body.documents);
      // Первая волна проходит, следующий батч валится намертво (400 без ретраев).
      if (++call > 3) return { ok: false, status: 400, json: async () => ({}), text: async () => "bad" };
      return embeddingsOk(body.input);
    });

    const result = await selectRelevantUnits(segmentGuidelines(GUIDELINES), { budgetMs: 60_000 });

    expect(result.stats.mode).toBe("keyword");
    expect(result.stats.costUsd).toBeGreaterThan(0);
  });
});
