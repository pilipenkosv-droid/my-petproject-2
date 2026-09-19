/**
 * Shared helper for the model-bench task (branch w38/26-model-bench).
 * Calls the Vercel AI Gateway directly with a chosen "provider/model" id —
 * does NOT touch the production MODEL_REGISTRY. Thinking off everywhere.
 * Tracks cumulative spend against a hard cap; call checkBudget() before
 * every request and recordSpend() after.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";

export const SPEND_FILE = "/tmp/diplox-model-bench-spend.json";
export const HARD_CAP_USD = 1.0;
export const STOP_LAUNCHING_USD = 0.8;

/** List prices per 1M tokens (in/out), USD — from the approved budget brief. */
export const PRICES: Record<string, { in: number; out: number }> = {
  "google/gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "openai/gpt-4.1-nano": { in: 0.1, out: 0.4 },
  "openai/gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "deepseek/deepseek-v3.2": { in: 0.26, out: 0.38 },
};

export interface BenchResult {
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  costUSD: number;
  durationMs: number;
  jsonParseFailed?: boolean;
}

function loadSpend(): number {
  if (!existsSync(SPEND_FILE)) return 0;
  try {
    return JSON.parse(readFileSync(SPEND_FILE, "utf8")).cumulativeUSD ?? 0;
  } catch {
    return 0;
  }
}

function saveSpend(v: number): void {
  writeFileSync(SPEND_FILE, JSON.stringify({ cumulativeUSD: v }));
}

export function resetSpend(): void {
  saveSpend(0);
}

/** Cumulative spend so far, across all bench scripts sharing SPEND_FILE. */
export function currentSpend(): number {
  return loadSpend();
}

/** Throws if launching one more call would risk exceeding the hard cap. */
export function checkBudget(): void {
  const spent = loadSpend();
  if (spent >= STOP_LAUNCHING_USD) {
    throw new Error(
      `BUDGET_STOP: cumulative spend $${spent.toFixed(4)} >= stop-launching threshold $${STOP_LAUNCHING_USD}`
    );
  }
}

function recordSpend(delta: number): number {
  const total = loadSpend() + delta;
  saveSpend(total);
  if (total > HARD_CAP_USD) {
    throw new Error(`BUDGET_HARD_CAP: cumulative spend $${total.toFixed(4)} exceeded hard cap $${HARD_CAP_USD}`);
  }
  return total;
}

function estimateCost(modelId: string, promptTokens: number, completionTokens: number): number {
  const p = PRICES[modelId];
  if (!p) return 0;
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}

/** One JSON-mode, thinking-off call through the Vercel AI Gateway. Prints running spend. */
export async function callGatewayModel(
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<BenchResult> {
  checkBudget();
  const apiKey = process.env.AI_GATEWAY_API_KEY!;
  const started = Date.now();

  const resp = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      reasoning: { enabled: false },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const durationMs = Date.now() - started;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`${modelId} HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const usage = data?.usage;
  const costUSD =
    usage?.cost ??
    estimateCost(modelId, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0);

  const total = recordSpend(costUSD);
  console.log(
    `[bench] ${modelId} durationMs=${durationMs} cost=$${costUSD.toFixed(5)} cumulative=$${total.toFixed(4)}`
  );

  return { text, usage, costUSD, durationMs };
}

export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return { ok: true, value: JSON.parse(m[0]) };
      } catch {
        /* fall through */
      }
    }
    return { ok: false };
  }
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
