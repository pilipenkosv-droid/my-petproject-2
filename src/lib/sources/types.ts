/**
 * Типы для подбора литературы (OpenAlex + CrossRef + AI-валидация)
 */

/** Сырой источник из API */
export interface RawSource {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  journal: string | null;
  type: string;
  url: string | null;
  source: "openalex" | "crossref";
}

/** Отформатированный и проверенный источник */
export interface FormattedSource {
  id: string;
  raw: RawSource;
  /** Строка по ГОСТ Р 7.0.5-2008 */
  formatted: string;
  /** AI-оценка релевантности */
  relevant: boolean;
  /** Пояснение почему (не)релевантен */
  relevanceNote: string;
}

/** Параметры поиска */
export interface SourceSearchParams {
  topic: string;
  workType: string;
  count: number;
}

/** Результат поиска */
export interface SourceSearchResult {
  sources: FormattedSource[];
  totalFound: number;
  apis: {
    openalex: number;
    crossref: number;
  };
}

/** Ответ AI-валидации */
export interface AIValidationResponse {
  sources: Array<{
    index: number;
    formatted: string;
    relevant: boolean;
    relevanceNote: string;
  }>;
}
