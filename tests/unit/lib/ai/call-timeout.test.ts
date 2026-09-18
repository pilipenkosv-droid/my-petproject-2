/**
 * Таймаут одной попытки вызова модели. Константы рассчитаны на 60-секундную
 * функцию Vercel; на воркере потолок снимается переменной окружения.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  baseTimeoutFor,
  AI_CALL_TIMEOUT_PAID_MS,
  AI_CALL_TIMEOUT_GEMINI_MS,
} from "@/lib/ai/gateway-providers";
import type { ModelConfig } from "@/lib/ai/model-registry";

function model(overrides: Partial<ModelConfig>): ModelConfig {
  return {
    id: "m",
    displayName: "M",
    protocol: "openai",
    apiKeyEnv: "AI_GATEWAY_API_KEY",
    modelId: "m",
    limits: { rpm: 10, rpd: 100, tpm: 1000 },
    ...overrides,
  } as ModelConfig;
}

const saved = process.env.AI_CALL_TIMEOUT_MS;

beforeEach(() => delete process.env.AI_CALL_TIMEOUT_MS);
afterEach(() => {
  if (saved === undefined) delete process.env.AI_CALL_TIMEOUT_MS;
  else process.env.AI_CALL_TIMEOUT_MS = saved;
});

describe("baseTimeoutFor", () => {
  it("без переменной — прежние константы", () => {
    expect(baseTimeoutFor(model({}))).toBe(AI_CALL_TIMEOUT_PAID_MS);
    expect(baseTimeoutFor(model({ protocol: "gemini" }))).toBe(AI_CALL_TIMEOUT_GEMINI_MS);
  });

  it("AI_CALL_TIMEOUT_MS переопределяет все сетевые протоколы", () => {
    process.env.AI_CALL_TIMEOUT_MS = "240000";
    expect(baseTimeoutFor(model({}))).toBe(240_000);
    expect(baseTimeoutFor(model({ protocol: "gemini" }))).toBe(240_000);
    expect(baseTimeoutFor(model({ apiKeyEnv: "GEMINI_API_KEY" }))).toBe(240_000);
  });

  it("claude-cli не трогаем: это локальный процесс, а не сетевой вызов", () => {
    process.env.AI_CALL_TIMEOUT_MS = "240000";
    expect(baseTimeoutFor(model({ protocol: "claude-cli" }))).toBe(120_000);
  });

  it("мусор и ноль игнорируются", () => {
    for (const raw of ["", "0", "-5", "abc", "10s"]) {
      process.env.AI_CALL_TIMEOUT_MS = raw;
      expect(baseTimeoutFor(model({}))).toBe(AI_CALL_TIMEOUT_PAID_MS);
    }
  });
});
