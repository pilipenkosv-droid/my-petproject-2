/**
 * Сегментация методички на смысловые единицы для ретрива.
 *
 * Перенесено из бенча (scripts/guidelines/segment.ts, ветка
 * w38/26-guidelines-retrieval) с одной правкой: порог дробления снижен
 * с 1200 до 600 символов. После извлечения текста из PDF абзацы приходят
 * кусками по 2–3 тысячи символов — на таком куске отбор бессмыслен,
 * в top-5 попадает половина документа.
 */

export interface Unit {
  /** Порядковый номер в документе; он же идентификатор [uN] в промпте. */
  i: number;
  text: string;
  /** Последний встреченный заголовок — для отладки и отчётов. */
  section: string;
}

/** Короче — не самостоятельное требование (номер страницы, обрывок строки). */
export const MIN_UNIT_CHARS = 15;
/** Длиннее — единица дробится по границам предложений. */
export const MAX_UNIT_CHARS = 600;
/** Строка короче — кандидат в строку таблицы / пункт перечня. */
const SHORT_LINE = 80;

/** Граница предложения: точка/!/?/; и заглавная буква, цифра или кавычка после. */
const SENTENCE_BOUNDARY = /(?<=[.!?;])\s+(?=[А-ЯA-Z0-9«"(])/;

const HEADING_RE = /^(?:(?:глава|раздел|приложение)\s+)?\d+(?:\.\d+)*\.?\s+\S/i;

function isHeading(line: string): boolean {
  if (line.length > 120) return false;
  if (HEADING_RE.test(line)) return true;
  const letters = line.replace(/[^А-ЯЁA-Zа-яёa-z]/g, "");
  return letters.length > 5 && letters === letters.toUpperCase();
}

/**
 * Длинный текст → куски не длиннее MAX_UNIT_CHARS по границам предложений.
 * Предложение никогда не режется посередине: если оно само длиннее порога,
 * оно остаётся отдельной единицей как есть.
 */
function splitBySentences(text: string): string[] {
  if (text.length <= MAX_UNIT_CHARS) return [text];
  const out: string[] = [];
  let buf = "";
  for (const sentence of text.split(SENTENCE_BOUNDARY)) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (buf && buf.length + 1 + piece.length > MAX_UNIT_CHARS) {
      out.push(buf);
      buf = piece;
      continue;
    }
    buf = buf ? `${buf} ${piece}` : piece;
  }
  if (buf) out.push(buf);
  return out;
}

/** Один блок (между пустыми строками) → список сырых единиц. */
function blockToUnits(block: string): string[] {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // Таблица или перечень: каждая строка — самостоятельное требование.
  const tableLike =
    lines.length >= 2 && lines.every((l) => l.length <= SHORT_LINE || l.includes("|"));
  if (tableLike) return lines;
  return splitBySentences(lines.join(" "));
}

/**
 * Режет текст методички на единицы. Детерминированно: одинаковый вход даёт
 * побайтово одинаковый выход, номера единиц сквозные от нуля.
 */
export function segmentGuidelines(text: string): Unit[] {
  const raw: string[] = [];
  for (const block of text.split(/\n\s*\n/)) raw.push(...blockToUnits(block));

  const units: Unit[] = [];
  let section = "";
  let pendingHeading = "";

  for (const piece of raw) {
    if (isHeading(piece)) {
      section = piece.slice(0, 120);
      // Нумерованный заголовок сам по себе требования не несёт —
      // приклеиваем его к следующей единице, чтобы не терять контекст.
      pendingHeading = pendingHeading ? `${pendingHeading} ${piece}` : piece;
      continue;
    }
    const text2 = pendingHeading ? `${pendingHeading} ${piece}` : piece;
    pendingHeading = "";
    if (text2.length < MIN_UNIT_CHARS) continue;
    units.push({ i: units.length, text: text2, section });
  }
  // Заголовок в самом конце документа — самостоятельная единица, не теряем.
  if (pendingHeading.length >= MIN_UNIT_CHARS) {
    units.push({ i: units.length, text: pendingHeading, section });
  }
  return units;
}
