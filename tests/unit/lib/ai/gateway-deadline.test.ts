import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelConfig } from "@/lib/ai/model-registry";

vi.mock("@/lib/ai/rate-limiter", () => ({
  canUseModel: vi.fn().mockResolvedValue(true),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  markModelFailed: vi.fn().mockResolvedValue(undefined),
  logDailySuccess: vi.fn().mockResolvedValue(undefined),
  logDailyFailure: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Подменяем транспорт на уровне invokeModel: тестируем оркестратор failover,
 * а не HTTP. Мок соблюдает переданный timeoutMs ровно так же, как настоящий
 * invokeModel, — поэтому по времени видно, обрезал ли callAI таймаут попытки
 * по остатку бюджета.
 */
const perModel = new Map<string, () => Promise<{ text: string }>>();
vi.mock("@/lib/ai/gateway-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/gateway-providers")>();
  return {
    ...actual,
    invokeModel: (model: ModelConfig, _req: unknown, timeoutMs: number) => {
      const impl = perModel.get(model.id) ?? (() => Promise.reject(new Error("no mock")));
      return Promise.race([
        impl(),
        new Promise<{ text: string }>((_, rej) =>
          setTimeout(() => rej(new Error(`${model.displayName} timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
    },
  };
});

/** fatalModels живёт на уровне модуля — каждому тесту нужен свежий gateway. */
async function freshGateway() {
  vi.resetModules();
  return {
    gateway: await import("@/lib/ai/gateway"),
    provider: await import("@/lib/ai/provider"),
  };
}

const never = () => new Promise<{ text: string }>(() => {});

beforeEach(() => {
  perModel.clear();
  // Цепочка прода: vercel (openai-compatible) → gemini flash → gemini flash lite.
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  delete process.env.BENCH_FORCE_MODEL;
  delete process.env.CLAUDE_CLI_ENABLED;
});

describe("callAI: бюджет запроса", () => {
  it("обрезает таймаут попытки по остатку и не начинает следующую", async () => {
    const { gateway } = await freshGateway();
    perModel.set("vercel-gemini-flash", never);
    perModel.set("google-gemini-flash", never);

    const started = Date.now();
    await expect(
      gateway.callAI({ systemPrompt: "s", userPrompt: "u", deadline: started + 6_000 })
    ).rejects.toBeInstanceOf(gateway.AIBudgetExceededError);

    // Попытка обрезана до ~6с вместо штатных 50с, вторую уже не начинаем.
    expect(Date.now() - started).toBeLessThan(9_000);
  }, 15_000);

  it("не начинает ни одной попытки, если бюджет уже исчерпан", async () => {
    const { gateway } = await freshGateway();
    const invoked = vi.fn(never);
    perModel.set("vercel-gemini-flash", invoked);

    await expect(
      gateway.callAI({ systemPrompt: "s", userPrompt: "u", deadline: Date.now() - 1 })
    ).rejects.toBeInstanceOf(gateway.AIBudgetExceededError);

    expect(invoked).not.toHaveBeenCalled();
  });

  it("без дедлайна поведение прежнее — успех первой модели", async () => {
    const { gateway } = await freshGateway();
    perModel.set("vercel-gemini-flash", async () => ({ text: '{"ok":true}' }));

    const res = await gateway.callAI({ systemPrompt: "s", userPrompt: "u" });

    expect(res.modelId).toBe("vercel-gemini-flash");
    expect(res.json).toEqual({ ok: true });
  });
});

describe("callAI: failover мимо мёртвой модели", () => {
  it("404 «model not found» не повторяет, сразу берёт следующую модель", async () => {
    const { gateway } = await freshGateway();
    const dead = vi.fn(async () => {
      throw new Error("Vercel Gemini 2.5 Flash HTTP 404: model not found");
    });
    perModel.set("vercel-gemini-flash", dead);
    perModel.set("google-gemini-flash", async () => ({ text: '{"from":"gemini"}' }));

    const started = Date.now();
    const res = await gateway.callAI({ systemPrompt: "s", userPrompt: "u" });

    expect(res.modelId).toBe("google-gemini-flash");
    expect(dead).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("мёртвая модель пропускается и в следующем вызове", async () => {
    const { gateway } = await freshGateway();
    const dead = vi.fn(async () => {
      throw new Error("Vercel HTTP 404: model no longer available");
    });
    perModel.set("vercel-gemini-flash", dead);
    perModel.set("google-gemini-flash", async () => ({ text: '{"from":"gemini"}' }));

    await gateway.callAI({ systemPrompt: "s", userPrompt: "u" });
    await gateway.callAI({ systemPrompt: "s", userPrompt: "u" });

    expect(dead).toHaveBeenCalledTimes(1);
  });

  it("429 квоты уводит к следующей модели немедленно", async () => {
    const { gateway } = await freshGateway();
    perModel.set("vercel-gemini-flash", async () => {
      throw new Error("Vercel HTTP 429: quota exceeded");
    });
    perModel.set("google-gemini-flash", async () => ({ text: '{"from":"gemini"}' }));

    const started = Date.now();
    const res = await gateway.callAI({ systemPrompt: "s", userPrompt: "u" });

    expect(res.modelId).toBe("google-gemini-flash");
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("parseFormattingRules", () => {
  it("уважает дедлайн и пробрасывает AIBudgetExceededError вместо подмены на ГОСТ", async () => {
    const { gateway, provider } = await freshGateway();
    perModel.set("vercel-gemini-flash", never);
    perModel.set("google-gemini-flash", never);

    const started = Date.now();
    await expect(
      provider.parseFormattingRules("текст методички", { deadline: started + 6_000 })
    ).rejects.toBeInstanceOf(gateway.AIBudgetExceededError);

    expect(Date.now() - started).toBeLessThan(9_000);
  }, 15_000);

  it("на обычной ошибке бросает RulesExtractionError, а не подменяет на ГОСТ", async () => {
    const { provider } = await freshGateway();
    const boom = async () => {
      throw new Error("boom");
    };
    perModel.set("vercel-gemini-flash", boom);
    perModel.set("google-gemini-flash", boom);
    perModel.set("google-gemini-flash-lite", boom);

    const err = await provider.parseFormattingRules("текст методички").catch((e) => e);

    expect(err).toBeInstanceOf(provider.RulesExtractionError);
    expect(err.reason).toBe("provider");
  });
});
