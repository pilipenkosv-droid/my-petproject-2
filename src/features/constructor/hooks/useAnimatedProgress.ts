"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface AnimatedStep {
  id: string;
  label: string;
  /** Progress range start (0-100) */
  rangeStart: number;
  /** Progress range end (0-100) */
  rangeEnd: number;
}

interface UseAnimatedProgressOptions {
  steps: AnimatedStep[];
  /** Legacy: minimum display time per step in ms. If `minTotalDuration` is set, this is ignored. */
  minStepDuration?: number;
  /** Minimum total animation time in ms across all steps (default: 60000). */
  minTotalDuration?: number;
  /** Extra random jitter added on top of minTotalDuration in ms (default: 30000). */
  totalJitter?: number;
  /** Progress increment interval in ms (default: 50) */
  tickInterval?: number;
}

interface AnimatedProgressResult {
  displayStep: string | null;
  displayProgress: number;
  isAnimating: boolean;
  /** Elapsed time since start() in milliseconds. 0 until start() is called, frozen on complete/fail. */
  elapsedMs: number;
  start: () => void;
  complete: (onDone: () => void) => void;
  fail: (errorMessage: string) => void;
  error: string | undefined;
}

export function useAnimatedProgress({
  steps,
  minStepDuration,
  minTotalDuration = 60000,
  totalJitter = 30000,
  tickInterval = 50,
}: UseAnimatedProgressOptions): AnimatedProgressResult {
  const [displayStep, setDisplayStep] = useState<string | null>(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [elapsedMs, setElapsedMs] = useState(0);

  const currentStepIndexRef = useRef(0);
  const stepStartTimeRef = useRef(0);
  const runStartTimeRef = useRef(0);
  const perStepDurationRef = useRef(0);
  const isCompletedRef = useRef(false);
  const onDoneCallbackRef = useRef<(() => void) | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (steps.length === 0) return;

    cleanup();
    setError(undefined);
    setIsAnimating(true);
    setElapsedMs(0);
    isCompletedRef.current = false;
    onDoneCallbackRef.current = null;
    currentStepIndexRef.current = 0;

    const now = Date.now();
    stepStartTimeRef.current = now;
    runStartTimeRef.current = now;

    const targetTotal = minStepDuration
      ? minStepDuration * steps.length
      : minTotalDuration + Math.random() * totalJitter;
    perStepDurationRef.current = Math.max(800, targetTotal / steps.length);

    setDisplayStep(steps[0].id);
    setDisplayProgress(steps[0].rangeStart);

    intervalRef.current = setInterval(() => {
      const idx = currentStepIndexRef.current;
      const step = steps[idx];
      if (!step) return;

      const nowTick = Date.now();
      setElapsedMs(nowTick - runStartTimeRef.current);

      const elapsed = nowTick - stepStartTimeRef.current;
      const stepDuration = perStepDurationRef.current;
      const stepRange = step.rangeEnd - step.rangeStart;

      const timeProgress = Math.min(elapsed / stepDuration, 1);
      const easedProgress = 1 - Math.pow(1 - timeProgress, 2);

      const isBackendDone = isCompletedRef.current;
      let targetProgress: number;

      if (isBackendDone && elapsed >= stepDuration) {
        targetProgress = step.rangeEnd;
      } else if (isBackendDone) {
        targetProgress = step.rangeStart + stepRange * easedProgress * 0.95;
      } else {
        targetProgress = step.rangeStart + stepRange * Math.min(easedProgress * 0.8, 0.8);
      }

      setDisplayProgress(Math.round(targetProgress));

      if (elapsed >= stepDuration) {
        const nextIdx = idx + 1;
        if (nextIdx < steps.length) {
          currentStepIndexRef.current = nextIdx;
          stepStartTimeRef.current = Date.now();
          setDisplayStep(steps[nextIdx].id);
          setDisplayProgress(steps[nextIdx].rangeStart);
        } else if (isBackendDone) {
          setDisplayProgress(100);
          setIsAnimating(false);
          cleanup();
          setTimeout(() => {
            onDoneCallbackRef.current?.();
          }, 400);
        }
      }
    }, tickInterval);
  }, [steps, minStepDuration, minTotalDuration, totalJitter, tickInterval, cleanup]);

  const complete = useCallback((onDone: () => void) => {
    isCompletedRef.current = true;
    onDoneCallbackRef.current = onDone;
  }, []);

  const fail = useCallback((errorMessage: string) => {
    cleanup();
    setError(errorMessage);
    setIsAnimating(false);
  }, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    displayStep,
    displayProgress,
    isAnimating,
    elapsedMs,
    start,
    complete,
    fail,
    error,
  };
}
