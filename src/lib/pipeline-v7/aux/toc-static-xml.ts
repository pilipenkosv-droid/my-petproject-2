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

/** Заголовки после абзаца поля — по pStyle DpxHeading1..3, текст из w:t. */
export function collectHeadings(xml: string, from: number): TocHeading[] {
  const out: TocHeading[] = [];
  for (const m of xml.slice(from).matchAll(P_RE)) {
    const level = m[0].match(/<w:pStyle w:val="DpxHeading([123])"\/>/)?.[1];
    if (!level) continue;
    const text = paragraphText(m[0]).replace(/\s+/g, " ").trim();
    if (text) out.push({ level: Number(level) as TocLevel, text });
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

/**
 * Первая страница (1-based), где встречается заголовок, или null.
 *
 * Поиск с третьей страницы: на первой титул, на второй само содержание —
 * его строки совпали бы с заголовком раньше настоящего вхождения.
 */
export function findHeadingPage(heading: string, pages: string[]): number | null {
  const needle = normalizeMatch(heading);
  if (needle.length < 3) return null;
  const compact = needle.slice(0, 40);
  for (let i = 2; i < pages.length; i++) {
    if (normalizeMatch(pages[i]).includes(compact)) return i + 1;
  }
  return null;
}

const INDENT: Record<TocLevel, number> = { 1: 0, 2: 220, 3: 440 };

/**
 * N абзацев на месте одного абзаца поля: первый несёт закладку и
 * begin+instr+separate, последний — fldChar end и закрытие закладки.
 */
export function buildTocParagraphs(
  entries: TocEntry[],
  parts: TocFieldParts,
  opts: { tabPos: number; styleFor: (level: TocLevel) => string }
): string {
  const rPr = parts.rPr;
  const run = (child: string) => `<w:r>${rPr}${child}</w:r>`;
  return entries
    .map((e, i) => {
      const first = i === 0;
      const last = i === entries.length - 1;
      const pPr =
        `<w:pPr><w:pStyle w:val="${opts.styleFor(e.level)}"/>` +
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
