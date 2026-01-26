"use client";

import { useState, useEffect, useCallback } from "react";
import { JobState } from "@/lib/storage/job-store";

interface UseJobStatusOptions {
  /** ID задачи */
  jobId: string;
  /** Интервал опроса в мс (по умолчанию 1000) */
  pollInterval?: number;
  /** Остановить опрос при достижении этих статусов */
  stopOnStatus?: string[];
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
    stopOnStatus = ["completed", "failed"] 
  } = options;

  const [job, setJob] = useState<JobApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldPoll, setShouldPoll] = useState(true);

  const fetchStatus = useCallback(async () => {
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

      // Останавливаем опрос, если достигли конечного статуса
      if (stopOnStatus.includes(data.status)) {
        setShouldPoll(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsLoading(false);
    }
  }, [jobId, stopOnStatus]);

  useEffect(() => {
    fetchStatus();

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
