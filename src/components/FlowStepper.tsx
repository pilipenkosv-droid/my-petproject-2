"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlowStepperProps {
  currentStep: number; // 0-indexed
  steps?: { label: string }[];
}

const DEFAULT_STEPS = [
  { label: "Загрузка" },
  { label: "Настройки" },
  { label: "Обработка" },
  { label: "Результат" },
];

export function FlowStepper({ currentStep, steps = DEFAULT_STEPS }: FlowStepperProps) {
  return (
    <div className="flex items-center w-full">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isFuture = index > currentStep;

        return (
          <div key={index} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-all shrink-0",
                  isCompleted && "bg-emerald-500 text-white",
                  isCurrent &&
                    "bg-gradient-to-br from-brand-2 to-brand-1 text-white ring-4 ring-brand-2/20",
                  isFuture && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden sm:block whitespace-nowrap",
                  isCompleted && "text-emerald-500",
                  isCurrent && "text-foreground",
                  isFuture && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-2 sm:mx-3 rounded-full transition-colors",
                  isCompleted ? "bg-emerald-500" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
