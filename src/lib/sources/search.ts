/**
 * Оркестратор поиска источников:
 * OpenAlex + CrossRef → дедупликация → AI-валидация + ГОСТ-форматирование
 */

import { nanoid } from "nanoid";
import { callAI } from "@/lib/ai/gateway";
import {
  SOURCES_VALIDATION_SYSTEM_PROMPT,
  createSourcesValidationPrompt,
} from "@/lib/ai/prompts";
import { searchOpenAlex } from "./openalex";
import { searchCrossRef } from "./crossref";
import type {
  RawSource,
  FormattedSource,
  SourceSearchParams,
  SourceSearchResult,
  AIValidationResponse,
} from "./types";

/**
 * Основной метод: ищет, дедуплицирует, валидирует через AI, форматирует по ГОСТ
 */
export async function searchSources(
  params: SourceSearchParams
): Promise<SourceSearchResult> {
  const { topic, workType, count } = params;

  // Запрашиваем с запасом — 2x от каждого API
  const fetchCount = count * 2;

  // Параллельный запрос к обоим API
  const [openAlexResult, crossRefResult] = await Promise.allSettled([
    searchOpenAlex(topic, fetchCount),
    searchCrossRef(topic, fetchCount),
  ]);

  const openAlexSources =
    openAlexResult.status === "fulfilled" ? openAlexResult.value : [];
  const crossRefSources =
    crossRefResult.status === "fulfilled" ? crossRefResult.value : [];

  // Дедупликация по DOI
  const allSources = deduplicateByDOI([
    ...openAlexSources,
    ...crossRefSources,
  ]);

  if (allSources.length === 0) {
    return {
      sources: [],
      totalFound: 0,
      apis: {
        openalex: openAlexSources.length,
        crossref: crossRefSources.length,
      },
    };
  }

  // AI-валидация и ГОСТ-форматирование
  const formatted = await validateAndFormat(topic, workType, allSources, count);

  return {
    sources: formatted,
    totalFound: openAlexSources.length + crossRefSources.length,
    apis: {
      openalex: openAlexSources.length,
      crossref: crossRefSources.length,
    },
  };
}

/**
 * Дедупликация по DOI — оставляем первый (OpenAlex приоритетнее)
 */
function deduplicateByDOI(sources: RawSource[]): RawSource[] {
  const seenDOI = new Set<string>();
  const result: RawSource[] = [];

  for (const source of sources) {
    if (source.doi) {
      const normalizedDOI = source.doi.toLowerCase().trim();
      if (seenDOI.has(normalizedDOI)) continue;
      seenDOI.add(normalizedDOI);
    }
    result.push(source);
  }

  return result;
}

/**
 * AI-валидация релевантности + ГОСТ-форматирование через callAI
 */
async function validateAndFormat(
  topic: string,
  workType: string,
  rawSources: RawSource[],
  targetCount: number
): Promise<FormattedSource[]> {
  // Ограничиваем число источников для AI (до 30, чтобы не превысить лимит токенов)
  const sourcesForAI = rawSources.slice(0, Math.min(rawSources.length, 30));

  const aiInput = sourcesForAI.map((s) => ({
    title: s.title,
    authors: s.authors,
    year: s.year,
    journal: s.journal,
    doi: s.doi,
    type: s.type,
  }));

  try {
    const response = await callAI({
      systemPrompt: SOURCES_VALIDATION_SYSTEM_PROMPT,
      userPrompt: createSourcesValidationPrompt(topic, workType, aiInput),
      temperature: 0.1,
      maxTokens: 4000,
    });

    const aiResult = response.json as AIValidationResponse;

    if (!aiResult?.sources || !Array.isArray(aiResult.sources)) {
      // Если AI вернул невалидный ответ — используем fallback
      return fallbackFormat(sourcesForAI, targetCount);
    }

    // Маппим AI результат обратно к raw sources
    const formatted: FormattedSource[] = [];

    for (const aiSource of aiResult.sources) {
      const rawIndex = aiSource.index - 1; // AI index начинается с 1
      if (rawIndex < 0 || rawIndex >= sourcesForAI.length) continue;

      formatted.push({
        id: nanoid(8),
        raw: sourcesForAI[rawIndex],
        formatted: aiSource.formatted || simpleFallbackFormat(sourcesForAI[rawIndex]),
        relevant: aiSource.relevant ?? true,
        relevanceNote: aiSource.relevanceNote || "",
      });
    }

    // Сортируем: релевантные первыми, потом по году (новее → первее)
    formatted.sort((a, b) => {
      if (a.relevant !== b.relevant) return a.relevant ? -1 : 1;
      return (b.raw.year || 0) - (a.raw.year || 0);
    });

    // Обрезаем до targetCount
    return formatted.slice(0, targetCount);
  } catch {
    // Если AI недоступен — fallback без валидации
    return fallbackFormat(sourcesForAI, targetCount);
  }
}

/**
 * Fallback: простое форматирование без AI
 */
function fallbackFormat(
  sources: RawSource[],
  targetCount: number
): FormattedSource[] {
  return sources.slice(0, targetCount).map((s) => ({
    id: nanoid(8),
    raw: s,
    formatted: simpleFallbackFormat(s),
    relevant: true,
    relevanceNote: "Автоматически добавлен (AI-валидация недоступна)",
  }));
}

/**
 * Простое форматирование одного источника (без AI)
 */
function simpleFallbackFormat(source: RawSource): string {
  const parts: string[] = [];

  // Автор(ы)
  if (source.authors.length > 0) {
    parts.push(source.authors[0]);
  }

  // Название
  parts.push(source.title);

  // Авторы после /
  if (source.authors.length > 0) {
    parts.push(`/ ${source.authors.join(", ")}`);
  }

  // Журнал
  if (source.journal) {
    parts.push(`// ${source.journal}`);
  }

  // Год
  if (source.year) {
    parts.push(`— ${source.year}`);
  }

  // URL
  if (source.doi) {
    parts.push(`— URL: https://doi.org/${source.doi}`);
  }

  return parts.join(". ") + ".";
}
