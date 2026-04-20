"use client";

import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { pickFlavor, buildSubSteps, type SubStep } from "@/features/constructor/lib/flavor-phrases";

export interface StepDefinition {
  id: string;
  label: string;
}

interface ProcessingStatusProps {
  currentStep: string | null;
  progress: number;
  error?: string;
  steps?: StepDefinition[];
  /** Elapsed milliseconds from the animation hook. If provided, a stopwatch is rendered. */
  elapsedMs?: number;
  /** Pages in uploaded document — used to generate plausible sub-step counts. */
  pageCount?: number;
}

const DEFAULT_STEPS: StepDefinition[] = [
  { id: "uploading", label: "Загрузка файлов" },
  { id: "extracting_text", label: "Извлечение текста" },
  { id: "parsing_rules", label: "Анализ требований" },
  { id: "analyzing", label: "Проверка документа" },
  { id: "formatting", label: "Применение форматирования" },
  { id: "completed", label: "Готово" },
];

function formatStopwatch(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ProcessingStatus({
  currentStep,
  progress,
  error,
  steps,
  elapsedMs,
  pageCount,
}: ProcessingStatusProps) {
  const activeSteps = steps || DEFAULT_STEPS;

  const currentStepIndex = currentStep
    ? activeSteps.findIndex((s) => s.id === currentStep)
    : -1;

  // Flavor phrase rotation
  const [flavor, setFlavor] = useState<string | null>(null);
  const prevFlavorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentStep || error) {
      setFlavor(null);
      return;
    }
    const initial = pickFlavor(currentStep, prevFlavorRef.current);
    setFlavor(initial);
    prevFlavorRef.current = initial;

    const rotateInterval = setInterval(() => {
      const next = pickFlavor(currentStep, prevFlavorRef.current);
      setFlavor(next);
      prevFlavorRef.current = next;
    }, 2800 + Math.random() * 1200);

    return () => clearInterval(rotateInterval);
  }, [currentStep, error]);

  // Sub-steps log — appear with delays based on the plan in flavor-phrases
  const [visibleSubSteps, setVisibleSubSteps] = useState<SubStep[]>([]);
  const [activeSubStepId, setActiveSubStepId] = useState<string | null>(null);
  useEffect(() => {
    if (!currentStep || error) {
      setVisibleSubSteps([]);
      setActiveSubStepId(null);
      return;
    }
    const plan = buildSubSteps(currentStep, pageCount);
    if (plan.length === 0) {
      setVisibleSubSteps([]);
      setActiveSubStepId(null);
      return;
    }
    setVisibleSubSteps([]);
    setActiveSubStepId(plan[0].id);
    const timers: ReturnType<typeof setTimeout>[] = [];
    plan.forEach((sub, i) => {
      const t = setTimeout(() => {
        setVisibleSubSteps((prev) => [...prev, sub]);
        const nextActive = plan[i + 1]?.id ?? null;
        setActiveSubStepId(nextActive);
      }, sub.delayMs);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [currentStep, pageCount, error]);

  const getStepIcon = (index: number) => {
    if (error && index === currentStepIndex) {
      return (
        <div className="flex h-6 w-6 items-center justify-center bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/25">
          <span className="text-xs font-bold">!</span>
        </div>
      );
    }

    if (index < currentStepIndex) {
      return (
        <div className="flex h-6 w-6 items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
          <CheckCircle className="h-4 w-4 text-white" />
        </div>
      );
    }

    if (index === currentStepIndex) {
      return (
        <div className="relative flex h-6 w-6 items-center justify-center bg-foreground shadow-lg">
          <Loader2 className="h-4 w-4 text-background animate-spin" />
        </div>
      );
    }

    return (
      <div className="flex h-6 w-6 items-center justify-center border border-surface-border bg-surface">
        <Circle className="h-3 w-3 text-muted-foreground/60" />
      </div>
    );
  };

  const showStopwatch = typeof elapsedMs === "number";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-on-surface-subtle">Прогресс</span>
          <div className="flex items-baseline gap-3">
            {showStopwatch && (
              <span className="font-mono tabular-nums text-foreground">
                {formatStopwatch(elapsedMs!)}
              </span>
            )}
            <span className="font-semibold text-foreground">{Math.round(progress)}%</span>
          </div>
        </div>
        <Progress value={progress} />
      </div>

      <div className="space-y-3">
        {activeSteps.map((step, index) => {
          const isActive = index === currentStepIndex && !error;
          return (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 text-sm transition-all duration-300",
                index <= currentStepIndex ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {getStepIcon(index)}
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "transition-all duration-300 block",
                    isActive && "font-medium text-foreground"
                  )}
                >
                  {step.label}
                </span>
                {isActive && flavor && (
                  <span className="block text-sm font-medium text-primary/90 mt-1 animate-in fade-in duration-300">
                    {flavor}
                  </span>
                )}
                {isActive && visibleSubSteps.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs font-mono tabular-nums text-on-surface-muted">
                    {visibleSubSteps.map((sub) => (
                      <li
                        key={sub.id}
                        className="animate-in fade-in slide-in-from-left-1 duration-300 flex items-center gap-2"
                      >
                        <span className="text-emerald-500">✓</span>
                        <span>{sub.text}</span>
                      </li>
                    ))}
                    {activeSubStepId && (
                      <li className="flex items-center gap-2 text-on-surface-subtle">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>выполняется…</span>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4">
          <p className="text-sm text-red-400 font-medium">
            Ошибка обработки
          </p>
          <p className="text-sm text-on-surface-muted mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}
