/**
 * Предфильтр длинных методичек: оставить абзацы про оформление.
 *
 * Регулярки скопированы из бенча ретрива (scripts/guidelines/keyword-filter.ts,
 * ветка w38/26-guidelines-retrieval): keyword-бейзлайн даёт 81,9 % recall@10 по
 * 14 темам. Здесь он работает не как ранжирование, а как грубая отсечка —
 * порядок абзацев сохраняется, соседи попавшего абзаца берутся вместе с ним.
 */

/** Каждая группа — самостоятельный сигнал темы оформления. */
export const FORMATTING_PATTERNS: RegExp[] = [
  /шрифт|гарнитур|times new roman|arial/i,
  /кегл|размер\s+шрифт|\b1[24]\s*(пт|пунк)/i,
  /\bпол[еяй]\b|поля\s+страниц/i,
  /(лев|прав|верхн|нижн)\w*\s+пол|\b[123]?\d\s*мм/i,
  /межстрочн|интервал/i,
  /полуторн|1[.,]5|одинарн|двойн/i,
  /абзацн\w*\s+отступ|красн\w*\s+строк/i,
  /выравнив|по\s+ширине|отступ\s+перв/i,
  /нумерац\w*\s+страниц|номер\w*\s+страниц/i,
  /колонтитул|сквозн/i,
  /заголов|наименован\w*\s+раздел/i,
  /прописн|полужирн|с\s+нов\w*\s+страниц|без\s+точки/i,
  /таблиц/i,
  /рисун|иллюстрац|диаграмм|график|схем/i,
  /формул|уравнен/i,
  /перечислен|маркирован/i,
  /список\w*\s+(литератур|использован|источник)|библиограф/i,
  /приложени/i,
  /титульн\w*\s+лист|титул\b/i,
  /сноск|ссылк\w*\s+на\s+источник|цитир|библиографическ\w*\s+ссылк/i,
  /квадратн\w*\s+скобк|подстрочн|\[\d+\]/i,
  /кавычк|тире|дефис|неразрывн/i,
  /a4|формат\s+лист|ориентац/i,
];

/** Длиннее этого порога методичку сначала прореживаем. */
export const PREFILTER_THRESHOLD_CHARS = 60_000;

export interface PrefilterResult {
  text: string;
  /** Сколько символов выброшено (0 — фильтр не применялся). */
  droppedChars: number;
  applied: boolean;
}

function isFormattingParagraph(p: string): boolean {
  return FORMATTING_PATTERNS.some((re) => re.test(p));
}

/**
 * Оставляет абзацы про оформление плюс по одному соседу с каждой стороны:
 * требование часто продолжается в следующем абзаце («…не менее 12 строк.
 * Исключение — …»), а заголовок раздела стоит в предыдущем.
 */
export function prefilterGuidelines(text: string): PrefilterResult {
  if (text.length <= PREFILTER_THRESHOLD_CHARS) {
    return { text, droppedChars: 0, applied: false };
  }

  const paragraphs = text.split(/\n\s*\n/);
  const keep = new Set<number>();
  paragraphs.forEach((p, i) => {
    if (!isFormattingParagraph(p)) return;
    keep.add(i);
    if (i > 0) keep.add(i - 1);
    if (i < paragraphs.length - 1) keep.add(i + 1);
  });

  // Ничего не нашли — лучше отдать модели исходный текст, чем пустоту.
  if (keep.size === 0) return { text, droppedChars: 0, applied: false };

  const kept = [...keep].sort((a, b) => a - b).map((i) => paragraphs[i]);
  const filtered = kept.join("\n\n");
  return {
    text: filtered,
    droppedChars: Math.max(0, text.length - filtered.length),
    applied: true,
  };
}
