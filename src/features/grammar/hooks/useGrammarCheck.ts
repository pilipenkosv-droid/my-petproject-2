"use client";

import { useState, useCallback } from "react";
import type { GrammarError, GrammarCheckResult } from "@/lib/grammar/types";

export function useGrammarCheck() {
  const [errors, setErrors] = useState<GrammarError[]>([]);
  const [stats, setStats] = useState<GrammarCheckResult["stats"] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedText, setCheckedText] = useState<string>("");

  const check = useCallback(async (text: string) => {
    if (isChecking) return;

    setIsChecking(true);
    setError(null);
    setErrors([]);
    setStats(null);
    setCheckedText(text);

    try {
      const response = await fetch("/api/check-grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка при проверке грамматики");
      }

      const result: GrammarCheckResult = await response.json();
      setErrors(result.errors);
      setStats(result.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

  const reset = useCallback(() => {
    setErrors([]);
    setStats(null);
    setError(null);
    setCheckedText("");
  }, []);

  /**
   * Применить все первые замены и вернуть исправленный текст.
   * Обрабатываем ошибки в обратном порядке (по offset),
   * чтобы замены не сдвигали позиции последующих ошибок.
   */
  const getCorrectedText = useCallback((): string => {
    if (!checkedText || errors.length === 0) return checkedText;

    let result = checkedText;
    const sortedErrors = [...errors]
      .filter((e) => e.replacements.length > 0)
      .sort((a, b) => b.offset - a.offset); // обратный порядок

    for (const err of sortedErrors) {
      const before = result.slice(0, err.offset);
      const after = result.slice(err.offset + err.length);
      result = before + err.replacements[0] + after;
    }

    return result;
  }, [checkedText, errors]);

  return {
    errors,
    stats,
    isChecking,
    error,
    checkedText,
    check,
    reset,
    getCorrectedText,
  };
}
