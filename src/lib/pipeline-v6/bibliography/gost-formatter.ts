// ГОСТ 7.1-2003 bibliography formatter.
// Input: CSL-JSON items (standard interchange format from Zotero/Mendeley).
// Output: Russian-language references block sorted per ГОСТ (by first author
// surname, alphabetical).
//
// Lightweight implementation (no citation-js dep) — covers book, article,
// chapter, webpage, thesis. Extend patterns as needed.

export type CslItemType =
  | "book"
  | "article-journal"
  | "chapter"
  | "webpage"
  | "thesis"
  | "paper-conference"
  | "report";

export interface CslAuthor {
  family: string;
  given?: string;
  /** Alternative: full name as single string. */
  literal?: string;
}

export interface CslDate {
  "date-parts"?: [number, number?, number?][];
  literal?: string;
  raw?: string;
}

export interface CslItem {
  id: string;
  type: CslItemType;
  title: string;
  author?: CslAuthor[];
  editor?: CslAuthor[];
  "container-title"?: string;  // journal / book title
  publisher?: string;
  "publisher-place"?: string;
  issued?: CslDate;
  volume?: string | number;
  issue?: string | number;
  page?: string;
  "number-of-pages"?: string | number;
  edition?: string | number;
  URL?: string;
  accessed?: CslDate;
  ISBN?: string;
  DOI?: string;
}

function initialsFromGiven(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

function formatAuthorHeader(author: CslAuthor): string {
  if (author.literal) return author.literal;
  const initials = author.given ? initialsFromGiven(author.given) : "";
  return initials ? `${author.family}, ${initials}` : author.family;
}

function formatAuthorInline(author: CslAuthor): string {
  if (author.literal) return author.literal;
  const initials = author.given ? initialsFromGiven(author.given) : "";
  return initials ? `${initials} ${author.family}` : author.family;
}

function extractYear(date?: CslDate): string | null {
  if (!date) return null;
  if (date["date-parts"]?.[0]?.[0]) return String(date["date-parts"][0][0]);
  if (date.literal) {
    const m = date.literal.match(/\d{4}/);
    if (m) return m[0];
  }
  if (date.raw) {
    const m = date.raw.match(/\d{4}/);
    if (m) return m[0];
  }
  return null;
}

function formatAccessed(date?: CslDate): string | null {
  if (!date) return null;
  if (date["date-parts"]?.[0]) {
    const [y, m, d] = date["date-parts"][0];
    if (y && m && d) return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
    if (y) return String(y);
  }
  return date.literal ?? date.raw ?? null;
}

function joinAuthorsInline(authors: CslAuthor[]): string {
  if (authors.length === 0) return "";
  if (authors.length <= 3) return authors.map(formatAuthorInline).join(", ");
  return `${formatAuthorInline(authors[0])} [и др.]`;
}

function firstAuthorHeader(authors?: CslAuthor[]): string {
  if (!authors || authors.length === 0) return "";
  return formatAuthorHeader(authors[0]);
}

function formatBook(item: CslItem): string {
  const parts: string[] = [];
  const header = firstAuthorHeader(item.author);
  if (header) parts.push(`${header}.`);
  parts.push(item.title);
  if (item.author && item.author.length > 1) {
    parts.push(` / ${joinAuthorsInline(item.author)}`);
  } else if (item.editor && item.editor.length > 0) {
    parts.push(` / под ред. ${joinAuthorsInline(item.editor)}`);
  }
  const tail: string[] = [];
  if (item.edition) tail.push(`${item.edition}-е изд.`);
  const place = item["publisher-place"] ?? "Б.м.";
  const pub = item.publisher ?? "Б.и.";
  const year = extractYear(item.issued) ?? "Б.г.";
  tail.push(`${place} : ${pub}, ${year}`);
  if (item["number-of-pages"]) tail.push(`${item["number-of-pages"]} с.`);
  if (item.ISBN) tail.push(`ISBN ${item.ISBN}`);
  return [parts.join(""), ...tail].join(". — ");
}

function formatJournalArticle(item: CslItem): string {
  const header = firstAuthorHeader(item.author);
  const authorsInline = item.author && item.author.length > 1 ? ` / ${joinAuthorsInline(item.author)}` : "";
  const journal = item["container-title"] ?? "Без названия журнала";
  const year = extractYear(item.issued) ?? "Б.г.";
  const volume = item.volume ? ` Т. ${item.volume}` : "";
  const issue = item.issue ? `, № ${item.issue}` : "";
  const pages = item.page ? `. — С. ${item.page}` : "";
  return `${header ? header + ". " : ""}${item.title}${authorsInline} // ${journal}. — ${year}.${volume}${issue}${pages}.`;
}

function formatWebpage(item: CslItem): string {
  const header = firstAuthorHeader(item.author);
  const prefix = header ? `${header}. ` : "";
  const accessed = formatAccessed(item.accessed);
  const accessedSuffix = accessed ? ` (дата обращения: ${accessed})` : "";
  const url = item.URL ?? "";
  return `${prefix}${item.title} [Электронный ресурс]. — URL: ${url}${accessedSuffix}.`;
}

function formatThesis(item: CslItem): string {
  const header = firstAuthorHeader(item.author);
  const prefix = header ? `${header}. ` : "";
  const place = item["publisher-place"] ?? "Б.м.";
  const year = extractYear(item.issued) ?? "Б.г.";
  const pages = item["number-of-pages"] ? ` — ${item["number-of-pages"]} с.` : "";
  return `${prefix}${item.title} : дис. ... канд. наук. — ${place}, ${year}.${pages}`;
}

function formatChapter(item: CslItem): string {
  const header = firstAuthorHeader(item.author);
  const prefix = header ? `${header}. ` : "";
  const book = item["container-title"] ?? "Без названия сборника";
  const place = item["publisher-place"] ?? "Б.м.";
  const pub = item.publisher ?? "Б.и.";
  const year = extractYear(item.issued) ?? "Б.г.";
  const pages = item.page ? ` — С. ${item.page}.` : "";
  return `${prefix}${item.title} // ${book}. — ${place} : ${pub}, ${year}.${pages}`;
}

export function formatGostEntry(item: CslItem): string {
  switch (item.type) {
    case "book":
    case "report":
      return formatBook(item);
    case "article-journal":
    case "paper-conference":
      return formatJournalArticle(item);
    case "chapter":
      return formatChapter(item);
    case "webpage":
      return formatWebpage(item);
    case "thesis":
      return formatThesis(item);
  }
}

const collator = new Intl.Collator("ru", { sensitivity: "base" });

export function formatGostBibliography(items: CslItem[]): string[] {
  const sorted = [...items].sort((a, b) => {
    const aKey = a.author?.[0]?.family ?? a.title;
    const bKey = b.author?.[0]?.family ?? b.title;
    return collator.compare(aKey, bKey);
  });
  return sorted.map((item, idx) => `${idx + 1}. ${formatGostEntry(item)}`);
}
