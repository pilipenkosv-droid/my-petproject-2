"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { JobState } from "@/lib/storage/job-store";

interface UseJobStatusOptions {
  /** ID задачи */
  jobId: string;
  /** Интервал опроса в мс (по умолчанию 1000) */
  pollInterval?: number;
  /** Остановить опрос при достижении этих статусов */
  stopOnStatus?: string[];
  /** Таймаут в мс — остановить polling (по умолчанию 5 минут) */
  timeout?: number;
  /** Максимум последовательных ошибок перед остановкой (по умолчанию 5) */
  maxConsecutiveErrors?: number;
}

/** Расширенный тип для ответа API */
interface JobApiResponse extends Partial<JobState> {
  violationsCount?: number;
}

interface JobStatusResult {
  job: JobApiResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useJobStatus(options: UseJobStatusOptions): JobStatusResult {
  const {
    jobId,
    pollInterval = 1000,
    stopOnStatus = ["completed", "failed"],
    timeout = 5 * 60 * 1000, // 5 минут
    maxConsecutiveErrors = 5,
  } = options;

  const [job, setJob] = useState<JobApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldPoll, setShouldPoll] = useState(true);
  const startTimeRef = useRef(Date.now());
  const consecutiveErrorsRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    // Проверка таймаута
    if (Date.now() - startTimeRef.current > timeout) {
      setError("Превышено время ожидания обработки. Попробуйте обновить страницу.");
      setShouldPoll(false);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/status/${jobId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError("Задача не найдена");
          setShouldPoll(false);
          return;
        }
        throw new Error("Ошибка при получении статуса");
      }

      const data = await response.json();
      setJob(data);
      setError(null);
      consecutiveErrorsRef.current = 0;

      // Останавливаем опрос, если достигли конечного статуса
      if (stopOnStatus.includes(data.status)) {
        setShouldPoll(false);
      }
    } catch (err) {
      consecutiveErrorsRef.current++;
      const errMsg = err instanceof Error ? err.message : "Неизвестная ошибка";

      if (consecutiveErrorsRef.current >= maxConsecutiveErrors) {
        setError(
          `Потеряна связь с сервером (${consecutiveErrorsRef.current} ошибок подряд). Попробуйте обновить страницу.`
        );
        setShouldPoll(false);
      } else {
        setError(errMsg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [jobId, stopOnStatus, timeout, maxConsecutiveErrors]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    consecutiveErrorsRef.current = 0;
    setShouldPoll(true);
    setIsLoading(true);
    fetchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (!shouldPoll) return;

    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStatus, pollInterval, shouldPoll]);

  return {
    job,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}
