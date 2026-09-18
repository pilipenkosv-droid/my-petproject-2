/**
 * Общая инфраструктура бенча ретрива по методичкам:
 * пути, бюджет, журнал вызовов, обёртка над AI Gateway с ретраями.
 *
 * ВАЖНО: запускать с NODE_USE_ENV_PROXY=1 — иначе undici идёт мимо локального
 * прокси и подвисает на чтении крупных тел ответа шлюза (проверено 18.09.2026).
 */

import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), ".env.local"), quiet: true });

export const ROOT = path.join(process.cwd(), "data", "bench", "guidelines");
export const DOCS_DIR = path.join(ROOT, "docs");
export const RULES_DIR = path.join(ROOT, "rules");
export const SEG_DIR = path.join(ROOT, "segments");
export const GOLD_DIR = path.join(ROOT, "gold");
export const EMB_DIR = path.join(ROOT, "emb");
export const OUT_DIR = path.join(ROOT, "out");
export const CALLS_LOG = path.join(ROOT, "calls.jsonl");

export const GATEWAY = "https://ai-gateway.vercel.sh/v1";

/** Жёсткий потолок расходов; выше — скрипты обязаны остановиться. */
export const HARD_CAP_USD = 0.75;
/** Порог, после которого новые вызовы не запускаются. */
export const SOFT_CAP_USD = 0.6;
/** Максимум одновременных запросов к шлюзу. */
export const MAX_CONCURRENCY = 3;

/** Прайс-лист шлюза (USD за токен), снят с /v1/models 18.09.2026. */
export const PRICE_PER_TOKEN: Record<string, { input: number; output?: number }> = {
  "voyage/voyage-4-lite": { input: 0.00000002 },
  "alibaba/qwen3-embedding-0.6b": { input: 0.00000001 },
  "openai/text-embedding-3-small": { input: 0.00000002 },
  "google/gemini-embedding-001": { input: 0.00000015 },
  "voyage/rerank-2.5-lite": { input: 0.00000002 },
  "voyage/rerank-2.5": { input: 0.00000005 },
  "google/gemini-2.5-flash": { input: 0.0000003, output: 0.0000025 },
};

export function ensureDirs(): void {
  for (const d of [ROOT, DOCS_DIR, RULES_DIR, SEG_DIR, GOLD_DIR, EMB_DIR, OUT_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export interface CallRecord {
  ts: string;
  stage: string;
  model: string;
  status: number | string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costSource: "usage" | "listprice";
  error?: string;
}

/** Суммарный расход по журналу — источник правды, переживает перезапуск. */
export function spentSoFar(): number {
  if (!fs.existsSync(CALLS_LOG)) return 0;
  let sum = 0;
  for (const line of fs.readFileSync(CALLS_LOG, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      sum += (JSON.parse(line) as CallRecord).costUsd || 0;
    } catch {
      /* битая строка журнала не должна ронять бенч */
    }
  }
  return sum;
}

export function logCall(rec: CallRecord): number {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.appendFileSync(CALLS_LOG, JSON.stringify(rec) + "\n");
  const total = spentSoFar();
  console.log(
    `[$] ${rec.stage} ${rec.model} ${rec.status} ${rec.latencyMs}ms ` +
      `+$${rec.costUsd.toFixed(6)} → итого $${total.toFixed(4)} / cap $${HARD_CAP_USD}`
  );
  return total;
}

export class BudgetStop extends Error {}

/** Ошибка шлюза, которую бессмысленно повторять (4xx кроме 429). */
export class FatalGatewayError extends Error {}

/** Проверка перед запуском вызова: дальше тратить нельзя. */
export function assertBudget(): void {
  const total = spentSoFar();
  if (total >= HARD_CAP_USD) throw new BudgetStop(`Жёсткий потолок: $${total.toFixed(4)}`);
  if (total >= SOFT_CAP_USD) throw new BudgetStop(`Мягкий стоп $${SOFT_CAP_USD}: $${total.toFixed(4)}`);
}

export function apiKey(): string {
  const k = process.env.AI_GATEWAY_API_KEY;
  if (!k) throw new Error("AI_GATEWAY_API_KEY не задан (.env.local)");
  return k;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GatewayResult<T> {
  body: T;
  latencyMs: number;
  status: number;
}

/** POST к шлюзу с 2 ретраями на 429/5xx/timeout. Бросает на исчерпании. */
export async function gatewayPost<T>(
  endpoint: string,
  payload: unknown,
  stage: string,
  model: string,
  timeoutMs = 180_000
): Promise<GatewayResult<T>> {
  assertBudget();
  let lastErr = "";
  for (let attempt = 0; attempt <= 2; attempt++) {
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${GATEWAY}${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      const latencyMs = Date.now() - started;
      const text = await res.text();
      if (res.ok) return { body: JSON.parse(text) as T, latencyMs, status: res.status };
      lastErr = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      logCall({
        ts: new Date().toISOString(), stage, model, status: res.status, latencyMs,
        inputTokens: 0, outputTokens: 0, costUsd: 0, costSource: "listprice", error: lastErr,
      });
      // 4xx кроме 429 — повтор даст ту же ошибку, дальше пробовать нечего.
      if (res.status !== 429 && res.status < 500) throw new FatalGatewayError(lastErr);
    } catch (e) {
      if (e instanceof FatalGatewayError || e instanceof BudgetStop) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
      logCall({
        ts: new Date().toISOString(), stage, model, status: "exception",
        latencyMs: Date.now() - started, inputTokens: 0, outputTokens: 0,
        costUsd: 0, costSource: "listprice", error: lastErr,
      });
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 2) await sleep(1500 * Math.pow(3, attempt));
  }
  throw new Error(`${stage}/${model}: исчерпаны ретраи — ${lastErr}`);
}

/** Пул задач с ограничением параллелизма. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
