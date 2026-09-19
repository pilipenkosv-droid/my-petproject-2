/**
 * Разбор и сборка XML для статического заполнения поля TOC (ADR-016, B1).
 *
 * Работаем со строкой `word/document.xml`, а не с деревом: заменяется ровно
 * один абзац поля, остальная разметка не должна пережить сериализацию заново.
 */

/** Уровень заголовка, как его проставил рестайлер (DpxHeading1..3). */
export type TocLevel = 1 | 2 | 3;

export interface TocHeading {
  level: TocLevel;
  text: string;
}

export interface TocEntry extends TocHeading {
  /** Номер страницы или «—», если заголовок не нашёлся в рендере. */
  page: string;
}

/** Куски исходного абзаца поля, которые переносятся в новые абзацы как есть. */
export interface TocFieldParts {
  /** Весь абзац поля целиком — то, что будет заменено. */
  paragraph: string;
  bookmarkStart: string;
  bookmarkEnd: string;
  /** Раны begin(dirty) + instrText + separate. */
  fieldOpen: string;
  /** Ран с fldChar end. */
  fieldEnd: string;
  /** rPr первого рана поля — шрифт и кегль для новых строк. */
  rPr: string;
}

const P_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
const RUN_RE = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]);
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphText(paragraph: string): string {
  return decodeXmlEntities(
    Array.from(paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))
      .map((m) => m[1])
      .join("")
  );
}

/**
 * Абзац поля TOC: закладка `_dpx_aux_toc_` плюс fldChar begin в том же абзаце.
 * Возвращает и сам абзац, и его позицию — заголовки собираются после неё.
 */
export function findTocField(xml: string): { parts: TocFieldParts; end: number } | null {
  for (const m of xml.matchAll(P_RE)) {
    const p = m[0];
    if (!p.includes("_dpx_aux_toc_") || !p.includes('w:fldCharType="begin"')) continue;
    const runs = p.match(RUN_RE) ?? [];
    const sepAt = runs.findIndex((r) => r.includes('w:fldCharType="separate"'));
    const endRun = runs.find((r) => r.includes('w:fldCharType="end"'));
    const bmStart = p.match(/<w:bookmarkStart[^>]*_dpx_aux_toc_[^>]*\/>/)?.[0];
    const bmEnd = p.match(/<w:bookmarkEnd[^>]*\/>/)?.[0];
    if (sepAt < 0 || !endRun || !bmStart || !bmEnd) continue;
    return {
      parts: {
        paragraph: p,
        bookmarkStart: bmStart,
        bookmarkEnd: bmEnd,
        fieldOpen: runs.slice(0, sepAt + 1).join(""),
        fieldEnd: endRun,
        rPr: (runs[0] ?? "").match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "",
      },
      end: m.index + p.length,
    };
  }
  return null;
}

function paragraphPPr(paragraph: string): string {
  return paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
}

/**
 * Уровень строки содержания, как его увидит само поле `TOC \o "1-3"`.
 *
 * Поле собирает абзацы по `w:outlineLvl`, а не по имени стиля, и рестайлер
 * (restyle/visual.ts, keepOutlineLvl) сохраняет чужой outlineLvl на body —
 * такой абзац Word включит в содержание, поэтому включаем и мы. DpxHeading
 * остаётся запасным признаком для абзацев без outlineLvl, а заголовок самого
 * содержания (DpxTocTitle) в список не идёт.
 */
function headingLevel(pPr: string): TocLevel | null {
  if (pPr.includes('w:pStyle w:val="DpxTocTitle"')) return null;
  const outline = pPr.match(/<w:outlineLvl w:val="(\d+)"\s*\/>/)?.[1];
  if (outline !== undefined) {
    const n = Number(outline);
    return n <= 2 ? ((n + 1) as TocLevel) : null;
  }
  const style = pPr.match(/<w:pStyle w:val="DpxHeading([123])"\/>/)?.[1];
  return style ? (Number(style) as TocLevel) : null;
}

/**
 * Заголовки после абзаца поля, в порядке документа.
 *
 * Известное ограничение: автонумерация из `w:numPr` в тексте абзаца не живёт,
 * поэтому в строку содержания она не попадает — Word при обновлении поля её
 * подставит, наш кэш её не покажет.
 */
export function collectHeadings(xml: string, from: number): TocHeading[] {
  const out: TocHeading[] = [];
  for (const m of xml.slice(from).matchAll(P_RE)) {
    const level = headingLevel(paragraphPPr(m[0]));
    if (level === null) continue;
    const text = paragraphText(m[0]).replace(/\s+/g, " ").trim();
    if (text) out.push({ level, text });
  }
  return out;
}

/** Ширина текстовой колонки в твипах по первой sectPr; 9638 — запасной А4. */
export function textWidthTwips(xml: string): number {
  const sect = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0];
  const w = Number(sect?.match(/<w:pgSz[^>]*\sw:w="(\d+)"/)?.[1] ?? 0);
  const left = Number(sect?.match(/<w:pgMar[^>]*\sw:left="(\d+)"/)?.[1] ?? 0);
  const right = Number(sect?.match(/<w:pgMar[^>]*\sw:right="(\d+)"/)?.[1] ?? 0);
  const width = w - left - right;
  return width > 1000 ? width : 9638;
}

function normalizeMatch(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Строка содержания в PDF: точечный лидер и номер страницы в конце. */
const TOC_LINE_RE = /\.{4,}\s*\d+\s*$/m;
const TOC_TITLE_RE = /^\s*(?:СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ)\s*$/im;

/**
 * Индекс последней страницы содержания в отрендеренном PDF.
 *
 * Фиксированную «страницу 2» брать нельзя: рендер идёт с UpdateFields, и
 * сгенерированное LibreOffice содержание вполне занимает две страницы (как и
 * титул) — тогда заголовки «находились» бы в самом содержании. Идём от
 * страницы с заголовком «СОДЕРЖАНИЕ» вперёд, пока страницы состоят из строк
 * с точечным лидером. Заголовка нет — остаётся прежнее допущение (титул +
 * содержание).
 */
export function tocLastPageIndex(pages: string[]): number {
  const start = pages.findIndex((p) => TOC_TITLE_RE.test(p));
  if (start < 0) return Math.min(1, pages.length - 1);
  let last = start;
  while (last + 1 < pages.length && TOC_LINE_RE.test(pages[last + 1])) last += 1;
  return last;
}

/**
 * Номера страниц заголовков (1-based) или null, если заголовок не нашёлся.
 *
 * Курсор монотонный: заголовки идут в порядке документа, поэтому следующий
 * ищется не раньше страницы предыдущего. Иначе три одинаковых «ПРИЛОЖЕНИЕ Б»
 * на страницах 8, 9 и 10 все получили бы «8».
 */
export function resolvePages(headings: TocHeading[], pages: string[]): (number | null)[] {
  let cursor = tocLastPageIndex(pages) + 1;
  let consumed = new Set<string>();
  return headings.map((h) => {
    const needle = normalizeMatch(h.text);
    if (needle.length < 3) return null;
    const compact = needle.slice(0, 40);
    for (let i = cursor; i < pages.length; i++) {
      if (!normalizeMatch(pages[i]).includes(compact)) continue;
      // Ту же строку на той же странице второй раз не отдаём — это дубль
      // заголовка, он стоит дальше.
      if (i === cursor && consumed.has(compact)) continue;
      if (i !== cursor) {
        cursor = i;
        consumed = new Set();
      }
      consumed.add(compact);
      return i + 1;
    }
    return null;
  });
}

const INDENT: Record<TocLevel, number> = { 1: 0, 2: 220, 3: 440 };

/**
 * N абзацев на месте одного абзаца поля: первый несёт закладку и
 * begin+instr+separate, последний — fldChar end и закрытие закладки.
 *
 * Стиль TOC1 с отступом по уровню. Раньше здесь стоял DpxBody ровно потому,
 * что TOC1..3 рестайлер v7 не объявлял, а ссылка на несуществующий стиль
 * отдаёт строку на усмотрение редактора. Теперь styles-writer определяет TOC1
 * сам (STYLE_IDS.tocEntry), и причина исчезла; заодно чекер признаёт такой
 * блок оглавлением (hasStaticToc).
 */
export function buildTocParagraphs(
  entries: TocEntry[],
  parts: TocFieldParts,
  opts: { tabPos: number }
): string {
  const rPr = parts.rPr;
  const run = (child: string) => `<w:r>${rPr}${child}</w:r>`;
  return entries
    .map((e, i) => {
      const first = i === 0;
      const last = i === entries.length - 1;
      const pPr =
        `<w:pPr><w:pStyle w:val="TOC1"/>` +
        `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${opts.tabPos}"/></w:tabs>` +
        `<w:ind w:left="${INDENT[e.level]}" w:firstLine="0"/><w:jc w:val="left"/></w:pPr>`;
      return (
        `<w:p>${pPr}` +
        (first ? parts.bookmarkStart + parts.fieldOpen : "") +
        run(`<w:t xml:space="preserve">${escapeXml(e.text)}</w:t>`) +
        run("<w:tab/>") +
        run(`<w:t>${escapeXml(e.page)}</w:t>`) +
        (last ? parts.fieldEnd + parts.bookmarkEnd : "") +
        `</w:p>`
      );
    })
    .join("");
}
