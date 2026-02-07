"use client";

import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDefinition {
  id: string;
  label: string;
}

interface ProcessingStatusProps {
  currentStep: string | null;
  progress: number;
  error?: string;
  /** Custom steps list. If not provided, uses default full pipeline steps. */
  steps?: StepDefinition[];
}

const DEFAULT_STEPS: StepDefinition[] = [
  { id: "uploading", label: "Загрузка файлов" },
  { id: "extracting_text", label: "Извлечение текста" },
  { id: "parsing_rules", label: "Анализ требований" },
  { id: "analyzing", label: "Проверка документа" },
  { id: "formatting", label: "Применение форматирования" },
  { id: "completed", label: "Готово" },
];

export function ProcessingStatus({
  currentStep,
  progress,
  error,
  steps,
}: ProcessingStatusProps) {
  const activeSteps = steps || DEFAULT_STEPS;

  const currentStepIndex = currentStep
    ? activeSteps.findIndex((s) => s.id === currentStep)
    : -1;

  const getStepIcon = (index: number) => {
    if (error && index === currentStepIndex) {
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/25">
          <span className="text-xs font-bold">!</span>
        </div>
      );
    }

    if (index < currentStepIndex) {
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
          <CheckCircle className="h-4 w-4 text-white" />
        </div>
      );
    }

    if (index === currentStepIndex) {
      return (
        <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
          <Loader2 className="h-4 w-4 text-white animate-spin" />
        </div>
      );
    }

    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-surface-border bg-surface">
        <Circle className="h-3 w-3 text-muted-foreground/60" />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-subtle">Прогресс</span>
          <span className="font-semibold text-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} />
      </div>

      <div className="space-y-3">
        {activeSteps.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-3 text-sm transition-all duration-300",
              index <= currentStepIndex
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            {getStepIcon(index)}
            <span
              className={cn(
                "transition-all duration-300",
                index === currentStepIndex && !error && "font-medium text-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm p-4">
          <p className="text-sm text-red-400 font-medium">
            Ошибка обработки
          </p>
          <p className="text-sm text-on-surface-muted mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}
