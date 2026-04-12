/**
 * Текстовые замены для всех параграфов документа
 *
 * Применяет:
 * - NBSP перед единицами измерения (5 мм → 5\u00A0мм)
 * - NBSP после инициалов (И. И. Иванов → И.\u00A0И.\u00A0Иванов)
 * - Замену запрещённых сокращений (т.д. → так далее)
 * - Замену прямых кавычек на угловые ("текст" → «текст»)
 * - Замену длинного тире на среднее (— → –)
 *
 * Работает с ordered-форматом fast-xml-parser (preserveOrder: true).
 */

import {
  type OrderedXmlNode,
  findChildren,
  getText,
  children,
  createNode,
  createTextNode,
} from "../xml/docx-xml";

const NBSP = "\u00A0";
const EN_DASH = "\u2013";
const EM_DASH = "\u2014";

/**
 * Маппинг сокращений → полное написание.
 * Ключ — нижний регистр для case-insensitive поиска.
 */
const ABBREVIATION_EXPANSIONS: Record<string, string> = {
  "т.д.": "так далее",
  "т.п.": "тому подобное",
  "т.е.": "то есть",
  "т.к.": "так как",
  "т.н.": "так называемый",
  "т.о.": "таким образом",
  "т.с.": "так сказать",
  "т.ч.": "так что",
  "г.о.": "главным образом",
  "д.б.": "должно быть",
  "м.б.": "может быть",
  "и др.": "и другие",
};

/**
 * NBSP перед единицами измерения
 */
function addNBSPBeforeUnits(text: string): string {
  return text.replace(
    /(\d)\s+(мм|см|дм|км|кг|мг|мл|мин|кВт|Вт|Гц|Па|МПа|дБ|об\/мин|м|г|л|с|ч|т|А|В|К|%|p\.|pp\.|pages?|с\.|стр\.)(?=[\s.,;:!?\-)}\]]|$)/gi,
    `$1${NBSP}$2`
  );
}

/**
 * NBSP после инициалов (И. И. Иванов → И.\u00A0И.\u00A0Иванов)
 */
function addNBSPAfterInitials(text: string): string {
  // Русские инициалы
  text = text
    .replace(/([А-ЯЁ])\.\s+([А-ЯЁ])\./g, `$1.${NBSP}$2.`)
    .replace(/([А-ЯЁ])\.\s+([А-ЯЁ][а-яё]+)/g, `$1.${NBSP}$2`);
  // Английские инициалы
  text = text
    .replace(/([A-Z])\.\s+([A-Z])\./g, `$1.${NBSP}$2.`)
    .replace(/([A-Z])\.\s+([A-Z][a-z]+)/g, `$1.${NBSP}$2`);
  return text;
}

/**
 * Замена прямых кавычек на угловые (русский текст)
 */
function fixQuotes(text: string): string {
  return text.replace(/"([^"]+)"/g, "\u00AB$1\u00BB");
}

/**
 * Замена длинного тире на среднее
 */
function fixDashes(text: string): string {
  return text.replace(new RegExp(EM_DASH, "g"), EN_DASH);
}

/**
 * Замена запрещённых сокращений на полное написание.
 * Учитывает контекст: "и т.д." → "и так далее", "и т. д." → "и так далее"
 */
function expandAbbreviations(text: string): string {
  for (const [abbr, expansion] of Object.entries(ABBREVIATION_EXPANSIONS)) {
    // Учитываем вариант с пробелом внутри: "т. д." и "т.д."
    const withSpace = abbr.replace(/\.(\S)/g, ". $1");
    // Экранируем точки для regex
    const escaped = abbr.replace(/\./g, "\\.").replace(/\//g, "\\/");
    const escapedWithSpace = withSpace.replace(/\./g, "\\.").replace(/\//g, "\\/");

    // Сначала вариант с пробелом (более длинный), потом без
    const pattern = new RegExp(`(${escapedWithSpace}|${escaped})`, "gi");
    text = text.replace(pattern, expansion);
  }
  return text;
}

/**
 * Удаляет ведущие пробелы/табуляции в начале текста параграфа.
 * Реальный отступ первой строки задаётся через w:ind firstLine в XML.
 * Пробелы-отступы — антипаттерн, нарушающий структуру документа.
 */
function stripLeadingSpaces(text: string): string {
  return text.replace(/^[\t ]+/, "");
}

/**
 * Схлопывает множественные пробелы в один.
 * Два и более пробела подряд → один пробел.
 * Не трогает NBSP (\u00A0) — они вставляются намеренно.
 */
function collapseMultipleSpaces(text: string): string {
  return text.replace(/ {2,}/g, " ");
}

/**
 * Исправляет двойные точки → одна точка.
 * Не трогает "..." (троеточие) и "…" (символ троеточия).
 */
function fixDoubleDots(text: string): string {
  // Заменяем ровно 2 точки подряд (не часть троеточия) на одну
  return text.replace(/(?<!\.)\.\.(?!\.)/g, ".");
}

/**
 * Применяет все текстовые замены к тексту параграфа
 */
export function applyTextFixes(text: string): string {
  let result = text;
  result = stripLeadingSpaces(result);
  result = collapseMultipleSpaces(result);
  result = fixDoubleDots(result);
  result = expandAbbreviations(result);
  result = addNBSPBeforeUnits(result);
  result = addNBSPAfterInitials(result);
  result = fixQuotes(result);
  result = fixDashes(result);
  return result;
}

/**
 * Применяет текстовые замены к XML-параграфу, сохраняя per-run форматирование.
 *
 * Стратегия: собираем текст из всех w:t с маппингом позиций,
 * применяем замены к объединённому тексту, затем распределяем результат
 * обратно по runs пропорционально исходным длинам.
 */
export function applyTextFixesToXmlParagraph(paragraph: OrderedXmlNode): boolean {
  const segments = collectRunSegments(paragraph);
  if (segments.length === 0) return false;

  const fullText = segments.map((s) => s.text).join("");
  if (!fullText.trim()) return false;

  const fixedText = applyTextFixes(fullText);
  if (fixedText === fullText) return false;

  redistributeText(segments, fullText, fixedText);
  return writeBackSegments(segments);
}

/** Сегмент текста с привязкой к w:t узлу */
export interface RunSegment {
  tNodeIndex: number;  // индекс в runChildren
  runChildren: OrderedXmlNode[];
  text: string;
  start: number;  // позиция начала в combined string
}

/** Собирает все w:t сегменты с позициями */
export function collectRunSegments(paragraph: OrderedXmlNode): RunSegment[] {
  const runs = findChildren(paragraph, "w:r");
  const segments: RunSegment[] = [];
  let offset = 0;

  for (const run of runs) {
    const runCh = children(run);
    for (let i = 0; i < runCh.length; i++) {
      if (!("w:t" in runCh[i])) continue;
      const text = getText(runCh[i]);
      segments.push({ tNodeIndex: i, runChildren: runCh, text, start: offset });
      offset += text.length;
    }
  }
  return segments;
}

/**
 * Распределяет исправленный текст обратно по сегментам, сохраняя per-run форматирование.
 *
 * Одинаковая длина → позиционное распределение (самый частый случай: тире, кавычки).
 * Разная длина → находим зону изменения, расширяем/сжимаем первый затронутый сегмент,
 * остальные затронутые очищаем, незатронутые сдвигаем.
 */
export function redistributeText(segments: RunSegment[], original: string, fixed: string): void {
  if (original.length === fixed.length) {
    let pos = 0;
    for (const s of segments) {
      s.text = fixed.substring(pos, pos + s.text.length);
      pos += s.text.length;
    }
    return;
  }

  // Находим зону изменения через общий prefix/suffix
  let pre = 0;
  while (pre < original.length && pre < fixed.length && original[pre] === fixed[pre]) pre++;
  let suf = 0;
  const maxSuf = Math.min(original.length - pre, fixed.length - pre);
  while (suf < maxSuf && original[original.length - 1 - suf] === fixed[fixed.length - 1 - suf]) suf++;

  const origEnd = original.length - suf;
  const delta = fixed.length - original.length;

  // Находим первый и последний затронутый сегмент
  let first = segments.length - 1;
  let last = first;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start + segments[i].text.length > pre) { first = i; break; }
  }
  for (let i = first; i < segments.length; i++) {
    if (segments[i].start < origEnd) last = i; else break;
  }

  // До зоны изменения — без изменений (текст не менялся, но вырезаем из fixed для консистентности)
  let pos = 0;
  for (let i = 0; i < first; i++) {
    segments[i].text = fixed.substring(pos, pos + segments[i].text.length);
    pos += segments[i].text.length;
  }

  // Затронутые сегменты: первый получает весь новый текст из зоны, остальные пустые
  const firstStart = segments[first].start;
  const lastEnd = segments[last].start + segments[last].text.length;
  const newLen = (lastEnd - firstStart) + delta;
  segments[first].text = fixed.substring(firstStart, firstStart + newLen);
  for (let i = first + 1; i <= last; i++) segments[i].text = "";

  // После зоны изменения — сдвигаем
  for (let i = last + 1; i < segments.length; i++) {
    const newStart = segments[i].start + delta;
    segments[i].text = fixed.substring(newStart, newStart + segments[i].text.length);
  }
}

/** Записывает обновлённые тексты обратно в w:t узлы */
export function writeBackSegments(segments: RunSegment[]): boolean {
  for (const s of segments) {
    s.runChildren[s.tNodeIndex] = createNode("w:t", { "xml:space": "preserve" }, [
      createTextNode(s.text),
    ]);
  }
  return true;
}
