/**
 * CrossRef API клиент для поиска академических источников
 *
 * API: https://api.crossref.org/swagger-ui/index.html
 * Бесплатный, polite pool через mailto в User-Agent
 */

import type { RawSource } from "./types";

const CROSSREF_API = "https://api.crossref.org/works";
const REQUEST_TIMEOUT_MS = 10_000;

interface CrossRefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossRefWork {
  DOI: string;
  title: string[];
  author?: CrossRefAuthor[];
  published?: {
    "date-parts": Array<Array<number>>;
  };
  "published-print"?: {
    "date-parts": Array<Array<number>>;
  };
  "published-online"?: {
    "date-parts": Array<Array<number>>;
  };
  "container-title"?: string[];
  type: string;
  URL?: string;
  link?: Array<{ URL: string }>;
}

interface CrossRefResponse {
  status: string;
  message: {
    items: CrossRefWork[];
    "total-results": number;
  };
}

/**
 * Поиск работ в CrossRef
 */
export async function searchCrossRef(
  query: string,
  count: number
): Promise<RawSource[]> {
  const params = new URLSearchParams({
    query,
    rows: String(Math.min(count, 50)),
    filter: "type:journal-article,type:book-chapter,type:book",
    sort: "relevance",
    select:
      "DOI,title,author,published,published-print,published-online,container-title,type,URL,link",
  });

  const mailto = process.env.CROSSREF_MAILTO || "";
  const userAgent = mailto
    ? `Diplox/1.0 (mailto:${mailto})`
    : "Diplox/1.0";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${CROSSREF_API}?${params}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`CrossRef API error: ${response.status}`);
    }

    const data: CrossRefResponse = await response.json();
    return data.message.items.map(mapWork);
  } finally {
    clearTimeout(timeout);
  }
}

function mapWork(work: CrossRefWork): RawSource {
  const authors = (work.author || [])
    .slice(0, 5)
    .map(formatCrossRefAuthor)
    .filter(Boolean);

  const year = extractYear(work);

  const url =
    work.URL ||
    work.link?.[0]?.URL ||
    (work.DOI ? `https://doi.org/${work.DOI}` : null);

  return {
    title: work.title?.[0] || "Без названия",
    authors,
    year,
    doi: work.DOI || null,
    journal: work["container-title"]?.[0] || null,
    type: work.type || "unknown",
    url,
    source: "crossref",
  };
}

/**
 * Форматирует автора CrossRef: { given: "John", family: "Smith" } → "Smith J."
 */
function formatCrossRefAuthor(author: CrossRefAuthor): string {
  if (author.name) return author.name;
  if (!author.family) return "";

  if (!author.given) return author.family;

  const initials = author.given
    .split(/[\s-]+/)
    .map((p) => p.charAt(0).toUpperCase() + ".")
    .join("");

  return `${author.family} ${initials}`;
}

function extractYear(work: CrossRefWork): number | null {
  const dateParts =
    work.published?.["date-parts"]?.[0] ||
    work["published-print"]?.["date-parts"]?.[0] ||
    work["published-online"]?.["date-parts"]?.[0];

  if (!dateParts || dateParts.length === 0) return null;
  return dateParts[0] || null;
}
