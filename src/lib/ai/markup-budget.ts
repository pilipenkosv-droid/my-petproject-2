/**
 * Wall-clock budget for the AI block-markup stage.
 *
 * The stage runs inside a Vercel function with maxDuration = 60s, and a single
 * gateway call may take up to AI_CALL_TIMEOUT (50s). Without a budget the stage
 * can consume the whole function and the job dies with "Превышено время обработки".
 * With a budget the stage degrades to deterministic rule-based classification
 * instead of dying.
 */

import { BlockMarkupItem } from "./block-markup-schemas";
import { classifyBlockRuleBased, ParagraphWithMarkup } from "./rule-based-block-classifier";

export const DEFAULT_MARKUP_BUDGET_MS = 25_000;

/** Sentinel returned by raceDeadline when the budget ran out. */
export const BUDGET_EXPIRED = Symbol("markup-budget-expired");

export function getMarkupBudgetMs(): number {
  const raw = Number(process.env.MARKUP_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MARKUP_BUDGET_MS;
}

/**
 * Races a promise against an absolute deadline (ms since epoch).
 * Returns BUDGET_EXPIRED instead of waiting for a straggler.
 *
 * The original promise always gets a handler attached, so a rejection arriving
 * after the deadline never surfaces as an unhandled rejection.
 */
export function raceDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number
): Promise<T | typeof BUDGET_EXPIRED> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error })
  );

  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) return Promise.resolve(BUDGET_EXPIRED);

  // setTimeout переполняется на задержке > 2^31-1 мс и срабатывает немедленно —
  // абсурдный дедлайн (кривой MARKUP_BUDGET_MS) обрезаем до максимума.
  const delay = Math.min(remaining, 2 ** 31 - 1);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof BUDGET_EXPIRED>((resolve) => {
    timer = setTimeout(() => resolve(BUDGET_EXPIRED), delay);
  });

  return Promise.race([settled, expiry]).then((result) => {
    if (timer) clearTimeout(timer);
    if (result === BUDGET_EXPIRED) return BUDGET_EXPIRED;
    if (result.ok) return result.value;
    throw result.error;
  });
}

/** Deterministic markup for paragraphs the AI never got to. */
export function ruleBasedMarkupFor(paragraphs: ParagraphWithMarkup[]): BlockMarkupItem[] {
  return paragraphs.map((p) => ({
    paragraphIndex: p.index,
    blockType: classifyBlockRuleBased(p),
    confidence: 0.4,
  }));
}
