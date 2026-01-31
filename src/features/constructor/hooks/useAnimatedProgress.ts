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
  /** Minimum display time per step in ms (default: 1500) */
  minStepDuration?: number;
  /** Progress increment interval in ms (default: 50) */
  tickInterval?: number;
}

interface AnimatedProgressResult {
  displayStep: string | null;
  displayProgress: number;
  isAnimating: boolean;
  /** Call to start the animation */
  start: () => void;
  /** Call when real processing completes successfully */
  complete: (onDone: () => void) => void;
  /** Call when real processing fails */
  fail: (errorMessage: string) => void;
  error: string | undefined;
}

export function useAnimatedProgress({
  steps,
  minStepDuration = 1500,
  tickInterval = 50,
}: UseAnimatedProgressOptions): AnimatedProgressResult {
  const [displayStep, setDisplayStep] = useState<string | null>(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const currentStepIndexRef = useRef(0);
  const stepStartTimeRef = useRef(0);
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
    isCompletedRef.current = false;
    onDoneCallbackRef.current = null;
    currentStepIndexRef.current = 0;
    stepStartTimeRef.current = Date.now();

    setDisplayStep(steps[0].id);
    setDisplayProgress(steps[0].rangeStart);

    intervalRef.current = setInterval(() => {
      const idx = currentStepIndexRef.current;
      const step = steps[idx];
      if (!step) return;

      const elapsed = Date.now() - stepStartTimeRef.current;
      const stepRange = step.rangeEnd - step.rangeStart;

      // Calculate progress within current step based on time
      const timeProgress = Math.min(elapsed / minStepDuration, 1);
      // Ease out: fast start, slow end within each step
      const easedProgress = 1 - Math.pow(1 - timeProgress, 2);

      // If backend is done and we're past min duration, speed up
      const isBackendDone = isCompletedRef.current;
      let targetProgress: number;

      if (isBackendDone && elapsed >= minStepDuration) {
        // Fast-forward: move to end of step quickly
        targetProgress = step.rangeEnd;
      } else if (isBackendDone) {
        // Backend done but still within min duration — fill to 90% of step range
        targetProgress = step.rangeStart + stepRange * easedProgress * 0.95;
      } else {
        // Backend still running — slow progress, cap at 80% of step range
        targetProgress = step.rangeStart + stepRange * Math.min(easedProgress * 0.8, 0.8);
      }

      setDisplayProgress(Math.round(targetProgress));

      // Move to next step if min duration passed
      if (elapsed >= minStepDuration) {
        const nextIdx = idx + 1;
        if (nextIdx < steps.length) {
          currentStepIndexRef.current = nextIdx;
          stepStartTimeRef.current = Date.now();
          setDisplayStep(steps[nextIdx].id);
          setDisplayProgress(steps[nextIdx].rangeStart);
        } else if (isBackendDone) {
          // All steps done and backend is complete
          setDisplayProgress(100);
          setIsAnimating(false);
          cleanup();
          // Small delay before calling done callback for visual completion
          setTimeout(() => {
            onDoneCallbackRef.current?.();
          }, 400);
        }
        // If all steps shown but backend not done yet — stay on last step
      }
    }, tickInterval);
  }, [steps, minStepDuration, tickInterval, cleanup]);

  const complete = useCallback((onDone: () => void) => {
    isCompletedRef.current = true;
    onDoneCallbackRef.current = onDone;
  }, []);

  const fail = useCallback((errorMessage: string) => {
    cleanup();
    setError(errorMessage);
    setIsAnimating(false);
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    displayStep,
    displayProgress,
    isAnimating,
    start,
    complete,
    fail,
    error,
  };
}
