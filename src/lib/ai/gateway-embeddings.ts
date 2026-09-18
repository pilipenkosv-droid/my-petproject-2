/**
 * Эмбеддинги и реранк через AI Gateway.
 *
 * Отдельный транспорт от gateway.ts: там чат-комплишены с выбором модели и
 * failover, здесь — два фиксированных endpoint-а без альтернатив. Формы
 * запросов и прайс сняты с бенча ретрива (scripts/guidelines/bench-embed.ts,
 * bench-rerank.ts, ветка w38/26-guidelines-retrieval, 18.09.2026).
 */

export const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

/** 94,8 % recall@10 при 0,0002 $/док — см. docs/adr/017-guidelines-retrieval.md. */
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
/** Реранк переносит качество на top-5: 93,4 % против 89,5 % у чистых эмбеддингов. */
export const RERANK_MODEL = "voyage/rerank-2.5-lite";

/** Шлюз принимает больше, но на 64 входах бенч не ловил обрывов соединения. */
export const EMBED_BATCH_SIZE = 64;
/**
 * Параллельных батчей. Один батч из 64 единиц идёт ~1,9 с (замер 18.09 с Mac
 * через прокси), методичка на 45k символов даёт 13 батчей: последовательно это
 * 25 с против бюджета в 8 с. Пять потоков укладывают их в три волны.
 */
export const EMBED_CONCURRENCY = 5;

/** $/токен, прайс-лист шлюза от 18.09.2026 (в ответе стоимость не приходит). */
export const EMBEDDING_PRICE_PER_TOKEN = 0.00000002;
export const RERANK_PRICE_PER_TOKEN = 0.00000002;
/** Токенайзер Voyage на русском ≈ 2,5 символа на токен — оценка для прайса. */
export const RERANK_CHARS_PER_TOKEN = 2.5;

/** Вызов не удался: ретраи исчерпаны, дедлайн вышел или шлюз ответил 4xx. */
export class GatewayEmbeddingsError extends Error {
  constructor(
    message: string,
    /** Сколько уже потрачено на успевшие батчи: деньги списаны и без результата. */
    readonly costUsd = 0
  ) {
    super(message);
    this.name = "GatewayEmbeddingsError";
  }
}

export function hasGatewayKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

interface PostOptions {
  /** Абсолютный дедлайн (ms since epoch): позже него попытки не запускаются. */
  deadline?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST к шлюзу с двумя ретраями на 429/5xx/сетевой сбой. */
async function post<T>(endpoint: string, payload: unknown, options: PostOptions): Promise<T> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new GatewayEmbeddingsError("AI_GATEWAY_API_KEY не задан");

  let lastError = "";
  for (let attempt = 0; attempt <= 2; attempt++) {
    const left = options.deadline ? options.deadline - Date.now() : 30_000;
    if (left <= 0) throw new GatewayEmbeddingsError(`${endpoint}: дедлайн ретрива исчерпан`);
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.min(left, 30_000)),
      });
      if (res.ok) return (await res.json()) as T;
      const text = await res.text().catch(() => "");
      lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      // 4xx кроме 429 — повтор даст ту же ошибку.
      if (res.status !== 429 && res.status < 500) throw new GatewayEmbeddingsError(lastError);
    } catch (error) {
      if (error instanceof GatewayEmbeddingsError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 2) await sleep(300 * Math.pow(3, attempt));
  }
  throw new GatewayEmbeddingsError(`${endpoint}: исчерпаны ретраи — ${lastError}`);
}

interface EmbeddingsBody {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export interface EmbedResult {
  /** Векторы в порядке входных текстов, нормированные к длине 1. */
  vectors: number[][];
  tokens: number;
  costUsd: number;
}

function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const len = Math.sqrt(sum) || 1;
  return v.map((x) => x / len);
}

/** Скалярное произведение нормированных векторов = косинусная близость. */
export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Один батч: векторы в порядке входов плюс израсходованные токены. */
async function embedBatch(
  model: string,
  batch: string[],
  options: PostOptions
): Promise<{ vectors: number[][]; tokens: number }> {
  const body = await post<EmbeddingsBody>("/embeddings", { model, input: batch }, options);
  const sorted = [...body.data].sort((a, b) => a.index - b.index);
  if (sorted.length !== batch.length) {
    throw new GatewayEmbeddingsError(
      `/embeddings: получено ${sorted.length} векторов на ${batch.length} входов`
    );
  }
  return {
    vectors: sorted.map((item) => normalize(item.embedding)),
    tokens: body.usage?.prompt_tokens ?? body.usage?.total_tokens ?? 0,
  };
}

/**
 * Векторы для списка текстов. Батчи идут волнами по EMBED_CONCURRENCY:
 * последовательный проход не укладывается в бюджет ретрива на длинных методичках.
 * Если хоть один батч упал, потраченное на успевшие уезжает в ошибку —
 * деньги списаны, и в отчёте это должно быть видно.
 */
export async function embed(
  texts: string[],
  options: PostOptions & { model?: string } = {}
): Promise<EmbedResult> {
  const model = options.model ?? EMBEDDING_MODEL;
  const batches = chunk(texts, EMBED_BATCH_SIZE);
  const done = new Array<{ vectors: number[][]; tokens: number } | undefined>(batches.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < batches.length) {
      const index = cursor++;
      done[index] = await embedBatch(model, batches[index], options);
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(EMBED_CONCURRENCY, batches.length) }, worker)
    );
  } catch (error) {
    const spent = done.reduce((s, r) => s + (r?.tokens ?? 0), 0) * EMBEDDING_PRICE_PER_TOKEN;
    const message = error instanceof Error ? error.message : String(error);
    throw new GatewayEmbeddingsError(message, spent);
  }

  const vectors = done.flatMap((r) => r!.vectors);
  const tokens = done.reduce((s, r) => s + r!.tokens, 0);
  return { vectors, tokens, costUsd: tokens * EMBEDDING_PRICE_PER_TOKEN };
}

interface RerankBody {
  results: Array<{ index: number; relevance_score: number }>;
  usage?: { total_tokens?: number };
}

export interface RerankResult {
  /** Позиции документов по убыванию релевантности. */
  order: number[];
  costUsd: number;
}

/** Переупорядочивает documents по релевантности query. */
export async function rerank(
  query: string,
  documents: string[],
  options: PostOptions & { model?: string } = {}
): Promise<RerankResult> {
  const model = options.model ?? RERANK_MODEL;
  const body = await post<RerankBody>(
    "/rerank",
    { model, query, documents, top_k: documents.length },
    options
  );
  const order = [...body.results]
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .map((r) => r.index)
    .filter((i) => i >= 0 && i < documents.length);

  const chars = query.length + documents.reduce((s, d) => s + d.length, 0);
  const tokens = body.usage?.total_tokens ?? Math.round(chars / RERANK_CHARS_PER_TOKEN);
  return { order, costUsd: tokens * RERANK_PRICE_PER_TOKEN };
}
