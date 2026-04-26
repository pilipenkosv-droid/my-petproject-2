/**
 * Серверная обрезка результатов AI-инструментов для anon/free тира.
 * Анонимы видят ~50% результата + email-gate / Pro upsell.
 */

const MIN_LENGTH_FOR_TRUNCATE = 20;

/**
 * Режет текст по слову на ~percent% длины.
 * Возвращает обрезанную версию с многоточием и количество скрытых символов.
 */
export function truncateText(
  text: string,
  percent = 50
): { truncated: string; hiddenChars: number } {
  if (!text) {
    return { truncated: "", hiddenChars: 0 };
  }

  if (text.length < MIN_LENGTH_FOR_TRUNCATE) {
    return { truncated: text, hiddenChars: 0 };
  }

  const targetIdx = Math.floor((text.length * percent) / 100);

  // Находим последнюю границу слова (whitespace) до targetIdx
  const slice = text.slice(0, targetIdx);
  const lastWs = slice.search(/\s\S*$/);
  const cutAt = lastWs > 0 ? lastWs : targetIdx;

  const truncated = text.slice(0, cutAt).trimEnd() + "…";
  const hiddenChars = text.length - cutAt;

  return { truncated, hiddenChars };
}

/**
 * Обрезает Markdown-аутлайн (план) на ~percent% секций верхнего уровня (h1/h2).
 * Сохраняет логичность структуры — режет по границе раздела, а не по словам.
 */
export function truncateOutline(
  markdown: string,
  percent = 50
): { truncated: string; hiddenSections: number } {
  if (!markdown) {
    return { truncated: "", hiddenSections: 0 };
  }

  const lines = markdown.split("\n");
  const sectionStarts: number[] = [];

  lines.forEach((line, i) => {
    if (/^#{1,2}\s+/.test(line)) {
      sectionStarts.push(i);
    }
  });

  if (sectionStarts.length === 0) {
    // Нет секций — fallback на текстовую обрезку
    const { truncated, hiddenChars } = truncateText(markdown, percent);
    return { truncated, hiddenSections: hiddenChars > 0 ? 1 : 0 };
  }

  if (sectionStarts.length === 1) {
    return { truncated: markdown, hiddenSections: 0 };
  }

  const keepCount = Math.max(1, Math.ceil((sectionStarts.length * percent) / 100));
  if (keepCount >= sectionStarts.length) {
    return { truncated: markdown, hiddenSections: 0 };
  }

  const cutLine = sectionStarts[keepCount];
  const truncated = lines.slice(0, cutLine).join("\n").trimEnd() + "\n\n…";
  const hiddenSections = sectionStarts.length - keepCount;

  return { truncated, hiddenSections };
}
