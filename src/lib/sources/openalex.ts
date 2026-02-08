/**
 * OpenAlex API клиент для поиска академических источников
 *
 * API: https://docs.openalex.org/api-entities/works
 * Бесплатный, polite pool через mailto header
 */

import type { RawSource } from "./types";

const OPENALEX_API = "https://api.openalex.org/works";
const REQUEST_TIMEOUT_MS = 10_000;

interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string;
  display_name: string;
  publication_year: number | null;
  type: string;
  authorships: Array<{
    author: {
      id: string;
      display_name: string;
    };
  }>;
  primary_location: {
    source: {
      display_name: string;
    } | null;
    landing_page_url: string | null;
  } | null;
  open_access: {
    oa_url: string | null;
  } | null;
}

interface OpenAlexResponse {
  meta: {
    count: number;
    per_page: number;
  };
  results: OpenAlexWork[];
}

/**
 * Поиск работ в OpenAlex
 */
export async function searchOpenAlex(
  query: string,
  count: number
): Promise<RawSource[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: String(Math.min(count, 50)),
    filter: "type:journal-article|book|book-chapter",
    sort: "relevance_score:desc",
    select:
      "id,doi,title,display_name,publication_year,type,authorships,primary_location,open_access",
  });

  const email = process.env.OPENALEX_EMAIL;
  if (email) {
    params.set("mailto", email);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENALEX_API}?${params}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`);
    }

    const data: OpenAlexResponse = await response.json();
    return data.results.map(mapWork);
  } finally {
    clearTimeout(timeout);
  }
}

function mapWork(work: OpenAlexWork): RawSource {
  const authors = work.authorships
    .slice(0, 5)
    .map((a) => formatAuthorName(a.author.display_name));

  // Извлекаем чистый DOI (без https://doi.org/ префикса)
  let doi = work.doi;
  if (doi && doi.startsWith("https://doi.org/")) {
    doi = doi.replace("https://doi.org/", "");
  }

  const url =
    work.open_access?.oa_url ||
    work.primary_location?.landing_page_url ||
    (doi ? `https://doi.org/${doi}` : null);

  return {
    title: work.display_name || work.title || "Без названия",
    authors,
    year: work.publication_year,
    doi,
    journal: work.primary_location?.source?.display_name || null,
    type: work.type || "unknown",
    url,
    source: "openalex",
  };
}

/**
 * Форматирует имя автора: "John Smith" → "Smith J."
 * Поддерживает кириллицу: "Иван Петров" → "Петров И."
 */
function formatAuthorName(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];

  // Берём последнее слово как фамилию, остальные — инициалы
  const lastName = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => p.charAt(0).toUpperCase() + ".")
    .join("");

  return `${lastName} ${initials}`;
}
