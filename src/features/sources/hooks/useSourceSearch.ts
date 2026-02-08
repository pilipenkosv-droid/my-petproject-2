"use client";

import { useState, useCallback } from "react";
import type { FormattedSource, SourceSearchResult } from "@/lib/sources/types";

interface UseSourceSearchReturn {
  /** Найденные источники */
  sources: FormattedSource[];
  /** Идёт поиск */
  isSearching: boolean;
  /** Ошибка */
  error: string | null;
  /** Общее количество найденных */
  totalFound: number;
  /** Статистика по API */
  apis: { openalex: number; crossref: number } | null;

  /** Запуск поиска */
  search: (topic: string, workType: string, count: number) => Promise<void>;
  /** Сброс */
  reset: () => void;

  /** ID выбранных источников */
  selectedIds: Set<string>;
  /** Переключить выбор одного */
  toggleSelected: (id: string) => void;
  /** Выбрать/снять все */
  toggleAll: () => void;
  /** Получить отформатированный список выбранных для копирования */
  getSelectedFormatted: () => string;
}

export function useSourceSearch(): UseSourceSearchReturn {
  const [sources, setSources] = useState<FormattedSource[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalFound, setTotalFound] = useState(0);
  const [apis, setApis] = useState<{ openalex: number; crossref: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const search = useCallback(
    async (topic: string, workType: string, count: number) => {
      setIsSearching(true);
      setError(null);
      setSources([]);
      setSelectedIds(new Set());
      setTotalFound(0);
      setApis(null);

      try {
        const response = await fetch("/api/find-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: topic.trim(), workType, count }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Ошибка при поиске источников");
        }

        const data: SourceSearchResult = await response.json();
        setSources(data.sources);
        setTotalFound(data.totalFound);
        setApis(data.apis);

        // Автоматически выбираем все релевантные
        const relevantIds = new Set(
          data.sources.filter((s) => s.relevant).map((s) => s.id)
        );
        setSelectedIds(relevantIds);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setSources([]);
    setError(null);
    setTotalFound(0);
    setApis(null);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === sources.length) {
        return new Set();
      }
      return new Set(sources.map((s) => s.id));
    });
  }, [sources]);

  const getSelectedFormatted = useCallback((): string => {
    const selected = sources.filter((s) => selectedIds.has(s.id));
    return selected
      .map((s, i) => `${i + 1}. ${s.formatted}`)
      .join("\n");
  }, [sources, selectedIds]);

  return {
    sources,
    isSearching,
    error,
    totalFound,
    apis,
    search,
    reset,
    selectedIds,
    toggleSelected,
    toggleAll,
    getSelectedFormatted,
  };
}
