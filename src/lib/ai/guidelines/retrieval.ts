/**
 * Отбор единиц методички, относящихся к оформлению.
 *
 * Связка из бенча 18.09.2026: эмбеддинги openai/text-embedding-3-small →
 * top-20 на тему по косинусу → реранк voyage/rerank-2.5-lite → top-5 на тему.
 * 97,0 % recall@10 и 93,4 % @5 при 0,0006 $/документ.
 *
 * Смысл ретрива — НЕ экономия: счёт в извлечении делают выходные токены.
 * Он снимает потолок длины методички и даёт провенанс (какие фрагменты
 * породили правило). Поэтому короткие методички через него не гоняются —
 * решение о пороге принимает provider.ts.
 */

import {
  embed,
  rerank,
  cosine,
  hasGatewayKey,
  EMBEDDING_MODEL,
  RERANK_MODEL,
} from "../gateway-embeddings";
import { rankByKeywords } from "./keyword-filter";
import { TOPICS } from "./topics";
import type { Unit } from "./segment";

/** Кандидатов на тему перед реранком. */
export const CANDIDATES_PER_TOPIC = 20;
/** Единиц на тему после реранка. */
export const TOP_PER_TOPIC = 5;
/** Единиц на тему без реранка (эмбеддинги или регулярки). */
export const TOP_PER_TOPIC_NO_RERANK = 8;
/** Бюджет всего ретрива: эмбеддинги + реранк. Роут даёт на запрос 50 с. */
export const RETRIEVAL_BUDGET_MS = 8_000;
/** Меньше этого остатка — за эмбеддинги не беремся, сразу регулярки. */
const MIN_EMBED_MS = 1_500;
/** Меньше этого остатка после эмбеддингов — реранк пропускаем. */
const MIN_RERANK_MS = 1_000;
/** Параллельных запросов реранка (по одному на тему, тем 14). */
const RERANK_CONCURRENCY = 4;

export type RetrievalMode = "rerank" | "embeddings" | "keyword";

export interface RetrievalStats {
  mode: RetrievalMode;
  unitsTotal: number;
  unitsSelected: number;
  charsIn: number;
  charsOut: number;
  embedMs: number;
  rerankMs: number;
  costUsd: number;
  /** Почему упали на запасной путь; пусто при штатном режиме. */
  fallbackReason?: string;
}

export interface RetrievalResult {
  /** Отобранные единицы в порядке документа. */
  units: Unit[];
  /** Тема → номера её единиц (i из Unit). */
  byTopic: Record<string, number[]>;
  stats: RetrievalStats;
}

export interface RetrievalOptions {
  /** Абсолютный дедлайн запроса; бюджет ретрива = min(остаток, budgetMs). */
  deadline?: number;
  budgetMs?: number;
}

function assemble(
  units: Unit[],
  byTopic: Record<string, number[]>,
  base: Omit<RetrievalStats, "unitsSelected" | "charsOut">
): RetrievalResult {
  const chosen = new Set<number>();
  for (const ids of Object.values(byTopic)) for (const id of ids) chosen.add(id);
  const selected = units.filter((u) => chosen.has(u.i));
  const charsOut = selected.reduce((s, u) => s + u.text.length, 0);
  return {
    units: selected,
    byTopic,
    stats: { ...base, unitsSelected: selected.length, charsOut },
  };
}

/** Запасной путь: регулярки из бенча, без единого сетевого вызова. */
function keywordFallback(
  units: Unit[],
  charsIn: number,
  partial: { embedMs: number; rerankMs: number; costUsd: number; reason: string }
): RetrievalResult {
  const byTopic: Record<string, number[]> = {};
  for (const topic of TOPICS) {
    byTopic[topic.key] = rankByKeywords(units, topic.key).slice(0, TOP_PER_TOPIC_NO_RERANK);
  }
  return assemble(units, byTopic, {
    mode: "keyword",
    unitsTotal: units.length,
    charsIn,
    embedMs: partial.embedMs,
    rerankMs: partial.rerankMs,
    costUsd: partial.costUsd,
    fallbackReason: partial.reason,
  });
}

/** Top-N единиц по каждой теме: макс-пулинг по формулировкам запроса. */
function rankByCosine(
  unitVectors: number[][],
  queryVectors: Map<string, number[][]>,
  limit: number
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const topic of TOPICS) {
    const qs = queryVectors.get(topic.key) ?? [];
    if (qs.length === 0) {
      out[topic.key] = [];
      continue;
    }
    const scored = unitVectors.map((u, i) => ({ i, s: Math.max(...qs.map((q) => cosine(u, q))) }));
    scored.sort((a, b) => b.s - a.s || a.i - b.i);
    out[topic.key] = scored.slice(0, limit).map((x) => x.i);
  }
  return out;
}

/** Задачи с ограничением параллелизма; порядок результатов сохраняется. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Эмбеддинги единиц и всех формулировок запросов одним проходом. */
async function embedAll(
  units: Unit[],
  deadline: number
): Promise<{ unitVectors: number[][]; queryVectors: Map<string, number[][]>; costUsd: number }> {
  const queries = TOPICS.flatMap((t) => t.queries.map((query) => ({ topic: t.key, query })));
  const inputs = [...units.map((u) => u.text), ...queries.map((q) => q.query)];
  const { vectors, costUsd } = await embed(inputs, { deadline, model: EMBEDDING_MODEL });

  const queryVectors = new Map<string, number[][]>();
  queries.forEach((q, n) => {
    const vector = vectors[units.length + n];
    queryVectors.set(q.topic, [...(queryVectors.get(q.topic) ?? []), vector]);
  });
  return { unitVectors: vectors.slice(0, units.length), queryVectors, costUsd };
}

/** Реранк кандидатов каждой темы; любая ошибка роняет весь шаг наверх. */
async function rerankTopics(
  units: Unit[],
  candidates: Record<string, number[]>,
  deadline: number
): Promise<{ byTopic: Record<string, number[]>; costUsd: number }> {
  const jobs = TOPICS.filter((t) => (candidates[t.key] ?? []).length > 0);
  const results = await pool(jobs, RERANK_CONCURRENCY, async (topic) => {
    const ids = candidates[topic.key];
    const texts = ids.map((i) => units[i].text);
    const { order, costUsd } = await rerank(topic.queries[0], texts, {
      deadline,
      model: RERANK_MODEL,
    });
    return { key: topic.key, ids: order.slice(0, TOP_PER_TOPIC).map((n) => ids[n]), costUsd };
  });

  const byTopic: Record<string, number[]> = {};
  for (const topic of TOPICS) byTopic[topic.key] = [];
  for (const r of results) byTopic[r.key] = r.ids;
  return { byTopic, costUsd: results.reduce((s, r) => s + r.costUsd, 0) };
}

/**
 * Отбирает единицы, относящиеся к 14 темам оформления.
 * Никогда не бросает: при любой поломке отдаёт результат регулярок,
 * пометив это в stats.mode и stats.fallbackReason.
 */
export async function selectRelevantUnits(
  units: Unit[],
  options: RetrievalOptions = {}
): Promise<RetrievalResult> {
  const charsIn = units.reduce((s, u) => s + u.text.length, 0);
  const budget = options.budgetMs ?? RETRIEVAL_BUDGET_MS;
  const deadline = Math.min(Date.now() + budget, options.deadline ?? Number.MAX_SAFE_INTEGER);

  if (!hasGatewayKey()) {
    return keywordFallback(units, charsIn, {
      embedMs: 0, rerankMs: 0, costUsd: 0, reason: "нет AI_GATEWAY_API_KEY",
    });
  }
  if (deadline - Date.now() < MIN_EMBED_MS) {
    return keywordFallback(units, charsIn, {
      embedMs: 0, rerankMs: 0, costUsd: 0, reason: "бюджет ретрива исчерпан до старта",
    });
  }

  const embedStarted = Date.now();
  let embedded: Awaited<ReturnType<typeof embedAll>>;
  try {
    embedded = await embedAll(units, deadline);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[retrieval] Эмбеддинги не удались, откат на регулярки: ${reason}`);
    return keywordFallback(units, charsIn, {
      embedMs: Date.now() - embedStarted, rerankMs: 0, costUsd: 0, reason,
    });
  }
  const embedMs = Date.now() - embedStarted;

  const candidates = rankByCosine(embedded.unitVectors, embedded.queryVectors, CANDIDATES_PER_TOPIC);
  const embeddingsOnly = (rerankMs: number, reason: string) =>
    assemble(units, rankByCosine(embedded.unitVectors, embedded.queryVectors, TOP_PER_TOPIC_NO_RERANK), {
      mode: "embeddings",
      unitsTotal: units.length,
      charsIn,
      embedMs,
      rerankMs,
      costUsd: embedded.costUsd,
      fallbackReason: reason,
    });

  if (deadline - Date.now() < MIN_RERANK_MS) {
    return embeddingsOnly(0, "бюджет ретрива исчерпан после эмбеддингов");
  }

  const rerankStarted = Date.now();
  try {
    const reranked = await rerankTopics(units, candidates, deadline);
    return assemble(units, reranked.byTopic, {
      mode: "rerank",
      unitsTotal: units.length,
      charsIn,
      embedMs,
      rerankMs: Date.now() - rerankStarted,
      costUsd: embedded.costUsd + reranked.costUsd,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[retrieval] Реранк не удался, остаёмся на эмбеддингах: ${reason}`);
    return embeddingsOnly(Date.now() - rerankStarted, reason);
  }
}

/** Контекст для модели: единицы в порядке документа с идентификаторами [uN]. */
export function buildRetrievalContext(units: Unit[]): string {
  return units.map((u) => `[u${u.i}] ${u.text}`).join("\n\n");
}
