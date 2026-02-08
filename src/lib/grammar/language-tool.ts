/**
 * Клиент LanguageTool API с поддержкой чанкинга больших текстов
 */

import type {
  LTMatch,
  LTResponse,
  GrammarCategory,
  GrammarError,
  GrammarCheckResult,
} from "./types";

const LT_ENDPOINT = "https://api.languagetool.org/v2/check";
const CHUNK_MAX_BYTES = 15_000; // 15KB — безопасно под лимит 20KB/запрос
const DELAY_BETWEEN_CHUNKS_MS = 3_200; // 20 req/min ≈ 3с/запрос + буфер
const REQUEST_TIMEOUT_MS = 15_000;

// ── Главная функция ────────────────────────────────────

export async function checkGrammar(
  text: string,
  language = "ru-RU"
): Promise<GrammarCheckResult> {
  const chunks = splitIntoChunks(text, CHUNK_MAX_BYTES);
  const allErrors: GrammarError[] = [];
  let chunkOffset = 0;

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }

    const response = await callLanguageTool(chunks[i], language);
    const errors = response.matches.map((match, idx) =>
      mapMatch(match, chunkOffset, i * 1000 + idx)
    );
    allErrors.push(...errors);
    chunkOffset += chunks[i].length;
  }

  return {
    errors: allErrors,
    stats: computeStats(allErrors),
  };
}

// ── Чанкинг ────────────────────────────────────────────

function splitIntoChunks(text: string, maxBytes: number): string[] {
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(text).length;

  // Если текст помещается в один запрос
  if (totalBytes <= maxBytes) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const chunk = cutChunk(remaining, maxBytes, encoder);
    chunks.push(chunk);
    remaining = remaining.slice(chunk.length);
  }

  return chunks;
}

function cutChunk(
  text: string,
  maxBytes: number,
  encoder: TextEncoder
): string {
  // Если оставшийся текст помещается — берём целиком
  if (encoder.encode(text).length <= maxBytes) {
    return text;
  }

  // Приблизительная позиция обрезки (UTF-8 кириллица ≈ 2 байта/символ)
  let cutPos = Math.floor(maxBytes / 2);

  // Ищем границу абзаца
  const paragraphBreak = text.lastIndexOf("\n\n", cutPos);
  if (paragraphBreak > cutPos * 0.5) {
    cutPos = paragraphBreak + 2; // включаем \n\n
  } else {
    // Ищем границу предложения
    const sentenceBreak = text.lastIndexOf(". ", cutPos);
    if (sentenceBreak > cutPos * 0.5) {
      cutPos = sentenceBreak + 2;
    }
    // Иначе режем по позиции
  }

  // Финальная проверка: уменьшаем пока не влезет в байты
  let chunk = text.slice(0, cutPos);
  while (encoder.encode(chunk).length > maxBytes && cutPos > 100) {
    cutPos = Math.floor(cutPos * 0.9);
    chunk = text.slice(0, cutPos);
  }

  return chunk;
}

// ── Вызов API ──────────────────────────────────────────

async function callLanguageTool(
  text: string,
  language: string,
  retried = false
): Promise<LTResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = new URLSearchParams({
      text,
      language,
      disabledRules: "WHITESPACE_RULE", // игнорируем пробельные ошибки
    });

    const response = await fetch(LT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (response.status === 429) {
      if (!retried) {
        // Ждём и повторяем один раз
        await sleep(10_000);
        return callLanguageTool(text, language, true);
      }
      throw new Error("429: Превышен лимит запросов к LanguageTool");
    }

    if (!response.ok) {
      throw new Error(
        `LanguageTool API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as LTResponse;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Маппинг ────────────────────────────────────────────

function mapMatch(
  match: LTMatch,
  chunkOffset: number,
  index: number
): GrammarError {
  const categoryId = match.rule.category.id;

  return {
    id: `err-${index}`,
    message: match.message,
    shortMessage: match.shortMessage || "",
    offset: match.offset + chunkOffset,
    length: match.length,
    replacements: match.replacements.slice(0, 5).map((r) => r.value),
    category: mapCategory(categoryId),
    categoryName: match.rule.category.name,
    ruleId: match.rule.id,
  };
}

function mapCategory(categoryId: string): GrammarCategory {
  const known: GrammarCategory[] = [
    "SPELLING",
    "GRAMMAR",
    "PUNCTUATION",
    "STYLE",
    "TYPOS",
    "CASING",
    "CONFUSED_WORDS",
  ];
  return known.includes(categoryId as GrammarCategory)
    ? (categoryId as GrammarCategory)
    : "OTHER";
}

// ── Статистика ─────────────────────────────────────────

function computeStats(errors: GrammarError[]): GrammarCheckResult["stats"] {
  const byCategory: Record<string, number> = {};

  for (const error of errors) {
    const cat = error.category;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  return {
    total: errors.length,
    byCategory,
  };
}

// ── Утилиты ────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
