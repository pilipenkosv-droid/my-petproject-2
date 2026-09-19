/**
 * Метрики визуального бенча v7 — всё считается по ОТРЕНДЕРЕННОМУ тексту PDF,
 * а не по XML. Смысл бенча в том, что XML-чекер ставит 97–99 документам,
 * которые пользователь оценивает на 1★: страницы, порядок заголовков и номера
 * в содержании видны только после вёрстки.
 *
 * PRIVACY: наружу отдаются индексы, уровни и счётчики. Текст заголовка
 * возвращается только когда вызывающий явно разрешил (`safeText` —
 * синтетический корпус); реальные документы приватны.
 */

import { execSync } from "child_process";
import { DocxPackage } from "../../../src/lib/pipeline-v7/docx/package";
import { classifyDocument } from "../../../src/lib/pipeline-v7/classify/deterministic";
import { isHeadingRole } from "../../../src/lib/pipeline-v7/classify/types";
import {
  resolvePages,
  tocLastPageIndex,
  type TocHeading,
  type TocLevel,
} from "../../../src/lib/pipeline-v7/aux/toc-static-xml";

const TOC_TITLE_RE = /^\s*(?:СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ)\s*$/im;
/** Строка содержания в PDF: текст, точечный лидер, номер страницы. */
const TOC_LINE_RE = /^(.*?\S)\s*\.{4,}\s*(\d+)\s*$/;
const INTRO_RE = /^введение$/i;
const NUMBERED_CHAPTER_RE = /^\d+(\.\d+)*[\s.)]/;
const TITLE_MARKER_RE =
  /МИНИСТЕРСТВ|УНИВЕРСИТЕТ|ИНСТИТУТ|АКАДЕМИ|ФАКУЛЬТЕТ|КАФЕДР|Выполнил|Научный руковод|Студент/i;

export const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Заголовки в порядке документа — по классификации v7 (T0), а не по разметке
 * выхода.
 *
 * Разбор выходного XML по `outlineLvl` здесь не годится: строки уже
 * существующего оглавления тоже несут outlineLvl, и «1.2 Анализ решений5»
 * попадала бы в список заголовков наравне с настоящим разделом. У
 * классификатора для них отдельная роль `toc`, и она сюда не идёт.
 * `appendix_heading` идёт: приложения в содержании перечисляются. Заголовок
 * самого содержания выброшен: он стоит ДО страниц содержания, а курсор поиска
 * начинается после них — иначе он числился бы ненайденным у каждого документа.
 */
export async function classifiedHeadings(input: Buffer): Promise<TocHeading[]> {
  const pkg = await DocxPackage.load(input);
  const c = await classifyDocument(pkg);
  const out: TocHeading[] = [];
  for (const cp of c.list) {
    if (cp.part !== "word/document.xml") continue;
    const level: TocLevel | null = isHeadingRole(cp.role)
      ? (Number(cp.role.slice(-1)) as TocLevel)
      : cp.role === "appendix_heading"
        ? 1
        : null;
    if (level === null) continue;
    const text = (cp.text ?? "").replace(/\s+/g, " ").trim();
    if (text && !TOC_TITLE_RE.test(text)) out.push({ level, text });
  }
  return out;
}

export interface HeadingOrderResult {
  total: number;
  /** Сколько заголовков нашлось в PDF монотонно, в порядке документа. */
  resolved: number;
  /** Индекс первого расхождения (заголовок не нашёлся дальше по тексту). */
  firstMissing: number | null;
  firstMissingLevel: number | null;
  firstMissingText?: string;
}

/**
 * `resolvePages` ищет заголовки монотонным курсором, поэтому первый `null` —
 * это и есть первое расхождение порядка: либо заголовок пропал при вёрстке,
 * либо он оказался раньше уже пройденной страницы.
 */
export function headingOrder(
  headings: TocHeading[],
  pages: string[],
  safeText: boolean
): { result: HeadingOrderResult; pages: (number | null)[] } {
  const resolved = resolvePages(headings, pages);
  const missing = resolved.findIndex((p) => p === null);
  const result: HeadingOrderResult = {
    total: headings.length,
    resolved: resolved.filter((p) => p !== null).length,
    firstMissing: missing < 0 ? null : missing,
    firstMissingLevel: missing < 0 ? null : headings[missing].level,
  };
  if (missing >= 0 && safeText) result.firstMissingText = headings[missing].text.slice(0, 60);
  return { result, pages: resolved };
}

/** Сколько на странице строк вида «текст .... N». */
function leaderLines(page: string): number {
  return page.split("\n").filter((l) => TOC_LINE_RE.test(l)).length;
}

/**
 * Диапазон страниц содержания [start, last] или null, если его нет.
 *
 * Запасной путь без заголовка «СОДЕРЖАНИЕ» нужен не для красоты: документы с
 * чужим оглавлением часто приходят вообще без такого заголовка (это отдельный
 * провал чекера `structure.tocHeading`), и без запасного пути номера страниц в
 * их содержании остались бы непроверенными.
 */
export function tocPageRange(pages: string[]): [number, number] | null {
  const titled = pages.findIndex((p) => TOC_TITLE_RE.test(p));
  if (titled >= 0) return [titled, tocLastPageIndex(pages)];
  const head = pages.slice(0, 4);
  const start = head.findIndex((p) => leaderLines(p) >= 3);
  if (start < 0) return null;
  let last = start;
  while (last + 1 < pages.length && leaderLines(pages[last + 1]) >= 3) last += 1;
  return [start, last];
}

/** Строки «текст .... N» со страниц содержания: нормализованный текст → номер. */
export function tocEntries(pages: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const range = tocPageRange(pages);
  if (!range) return out;
  for (let i = range[0]; i <= range[1]; i++) {
    for (const line of pages[i].split("\n")) {
      const m = TOC_LINE_RE.exec(line);
      if (!m) continue;
      const key = norm(m[1]);
      if (key.length >= 3 && !out.has(key)) out.set(key, Number(m[2]));
    }
  }
  return out;
}

export interface TocCheckResult {
  status: "ok" | "mismatch" | "no-toc" | "no-entries";
  entries: number;
  mismatches: number;
  /** Заголовки из документа, для которых строки в содержании не нашлось. */
  notListed: number;
  /** Индексы заголовков с расхождением (позиция в списке заголовков). */
  mismatchIndexes: number[];
  /**
   * Гистограмма «номер в содержании минус фактическая страница».
   * Одно и то же смещение у всех строк означает, что содержание сдвинуло
   * вёрстку уже после того, как в него записали номера.
   */
  deltas: Record<string, number>;
}

/**
 * Номера в содержании против фактических страниц заголовков.
 *
 * `claimed` снимается с рендера БЕЗ обновления полей — это кэш поля, который
 * записал `fillTocStatic` и который видит любой просмотрщик, не пересчитывающий
 * поля (превью, конвертация в PDF на сервере). `actual` — с обновлением полей,
 * то есть истина вёрстки.
 */
export function tocCheck(
  headings: TocHeading[],
  claimed: Map<string, number>,
  actual: (number | null)[]
): TocCheckResult {
  if (claimed.size === 0) {
    return { status: "no-entries", entries: 0, mismatches: 0, notListed: 0, mismatchIndexes: [], deltas: {} };
  }
  let notListed = 0;
  const mismatchIndexes: number[] = [];
  const deltas: Record<string, number> = {};
  headings.forEach((h, i) => {
    const page = actual[i];
    if (page === null) return;
    const said = claimed.get(norm(h.text));
    if (said === undefined) {
      notListed += 1;
      return;
    }
    if (said === page) return;
    mismatchIndexes.push(i);
    const key = String(said - page);
    deltas[key] = (deltas[key] ?? 0) + 1;
  });
  return {
    status: mismatchIndexes.length ? "mismatch" : "ok",
    entries: claimed.size,
    mismatches: mismatchIndexes.length,
    notListed,
    mismatchIndexes,
    deltas,
  };
}

/**
 * «Введение» стоит после содержания и до первой нумерованной главы.
 *
 * Условие «после содержания» выполняется по построению: `outputHeadings`
 * собирает заголовки только после абзаца поля TOC. Остаётся проверить, что
 * «Введение» не оказалось позади первой главы.
 */
export function introBeforeChapters(headings: TocHeading[]): "ok" | "bad" | "n/a" {
  const intro = headings.findIndex((h) => INTRO_RE.test(h.text.trim()));
  if (intro < 0) return "n/a";
  const chapter = headings.findIndex((h) => NUMBERED_CHAPTER_RE.test(h.text.trim()));
  if (chapter < 0) return "ok";
  return intro < chapter ? "ok" : "bad";
}

/** Титульная страница сохранилась: маркеры были в исходнике — должны быть и в выходе. */
export function firstPageIsTitle(srcPages: string[], outPages: string[]): "ok" | "lost" | "n/a" {
  if (!srcPages.length || !TITLE_MARKER_RE.test(srcPages[0])) return "n/a";
  if (!outPages.length) return "lost";
  return TITLE_MARKER_RE.test(outPages[0]) ? "ok" : "lost";
}

/** Пиксельный диff, если diff-pdf есть на PATH. null — сравнение не делалось. */
export function diffPdf(goldenPath: string, candidatePath: string): boolean | null {
  try {
    execSync(`diff-pdf "${goldenPath}" "${candidatePath}"`, { stdio: "pipe" });
    return true;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return status === 1 ? false : null;
  }
}
