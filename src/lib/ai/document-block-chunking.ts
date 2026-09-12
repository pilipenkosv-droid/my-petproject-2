/**
 * Чанкинг параграфов для AI-разметки: режем по смысловым границам документа.
 * Выделено из document-block-classify-ai.ts, чтобы файлы оставались ≤300 строк.
 */

import { DocumentBlockMarkup } from "./block-markup-schemas";

/** Целевой размер чанка (параграфов). Структурный чанкинг может дать ±20%. */
const TARGET_CHUNK_SIZE = 50;
export const MAX_CHUNK_SIZE = 70;
const MIN_CHUNK_SIZE = 15;

/** Паттерны структурных границ документа */
export const SECTION_BOUNDARY_RE =
  /^(?:введение|заключение|глава\s+\d|список\s+(?:использованных?\s+)?(?:источников|литературы)|библиограф|приложение\s+[а-яА-Яa-zA-Z]|содержание|оглавление|аннотация|abstract|список\s+сокращений)\s*$/i;

/** Структурный чанкинг: режет по смысловым границам документа. */
export function splitIntoStructuralChunks(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): Array<Array<{ index: number; text: string; style?: string }>> {
  if (paragraphs.length <= MAX_CHUNK_SIZE) {
    return [paragraphs];
  }

  const chunks: Array<Array<{ index: number; text: string; style?: string }>> = [];
  let start = 0;

  while (start < paragraphs.length) {
    const remaining = paragraphs.length - start;
    if (remaining <= MAX_CHUNK_SIZE) {
      chunks.push(paragraphs.slice(start));
      break;
    }

    let bestCut = -1;
    let bestScore = 0;

    for (let i = start + MIN_CHUNK_SIZE; i < start + MAX_CHUNK_SIZE && i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const text = p.text.trim();
      const style = (p.style || "").toLowerCase();
      let score = 0;

      if (SECTION_BOUNDARY_RE.test(text)) score = 100;
      else if (style.startsWith("heading")) score = 80;
      else if (/^\d+\.\d*\s+[А-ЯЁA-Z]/.test(text)) score = 70;
      else if (text === "") score = 30;

      const dist = Math.abs((i - start) - TARGET_CHUNK_SIZE);
      if (dist <= 5) score += 10;

      if (score > bestScore) {
        bestScore = score;
        bestCut = i;
      }
    }

    if (bestCut <= start) bestCut = start + TARGET_CHUNK_SIZE;
    chunks.push(paragraphs.slice(start, bestCut));
    start = bestCut;
  }

  return chunks;
}

/** Создаёт fallback-разметку при ошибке AI */
export function createFallbackMarkup(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): DocumentBlockMarkup {
  return {
    blocks: paragraphs.map((p) => ({
      paragraphIndex: p.index,
      blockType: p.text.trim() === "" ? ("empty" as const) : ("unknown" as const),
      confidence: 0,
    })),
    warnings: ["AI-разметка не удалась, используется fallback с типом unknown"],
  };
}
