/**
 * Классификация ошибок обработки и коды выхода дочернего процесса.
 *
 * Временная ошибка (сеть, 5xx шлюза, таймаут внешнего бинарника) означает, что
 * задачу имеет смысл вернуть в очередь. Всё остальное — терминально: повтор
 * даст ту же ошибку и сожжёт время очереди.
 */

/** Задача завершена успешно. */
export const EXIT_OK = 0;
/** Терминальная ошибка: ребёнок уже проставил failed и вернул списание. */
export const EXIT_PERMANENT = 2;
/** Временная ошибка: статус не тронут, супервизор решает, повторять ли. */
export const EXIT_TRANSIENT = 3;

const TRANSIENT_PATTERNS = [
  /\bfetch failed\b/i,
  /\bnetwork\b/i,
  /\bECONNRESET\b/,
  /\bECONNREFUSED\b/,
  /\bENOTFOUND\b/,
  /\bEAI_AGAIN\b/,
  /\bETIMEDOUT\b/,
  /\bsocket hang up\b/i,
  /\bkilled\b/i,
  /\btimed? ?out\b/i,
  /\b5\d{2}\b.*\b(gateway|upstream|server error)\b/i,
  /\b(gateway|upstream|server error)\b.*\b5\d{2}\b/i,
];

/** HTTP-статус, если ошибка его несёт (ошибки шлюза и Supabase кладут его в поле). */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const holder = error as { status?: unknown; statusCode?: unknown };
  const raw = holder.status ?? holder.statusCode;
  return typeof raw === "number" ? raw : undefined;
}

function textOf(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` ${error.cause.message}` : "";
    return `${error.name} ${error.message}${cause}`;
  }
  return String(error);
}

/** true — задачу стоит вернуть в очередь, false — терминальная ошибка. */
export function isTransientError(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) return status >= 500 && status <= 599;

  const text = textOf(error);
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(text));
}
