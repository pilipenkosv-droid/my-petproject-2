"use client";

import Link from "next/link";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProcessingStatus } from "@/features/constructor/components/ProcessingStatus";
import { Header } from "@/components/Header";
import { FlowStepper } from "@/components/FlowStepper";
import type { AnimatedStep } from "@/features/constructor/hooks/useAnimatedProgress";

export const PHASE2_STEPS: AnimatedStep[] = [
  { id: "validating_rules", label: "Подготовка правил к применению", rangeStart: 0, rangeEnd: 12 },
  { id: "analyzing", label: "AI-разметка и поиск нарушений", rangeStart: 12, rangeEnd: 45 },
  { id: "formatting", label: "Применение форматирования", rangeStart: 45, rangeEnd: 75 },
  { id: "checking_compliance", label: "Проверка соответствия методичке", rangeStart: 75, rangeEnd: 92 },
  { id: "finalizing", label: "Сборка итогового документа", rangeStart: 92, rangeEnd: 100 },
];

const PHASE2_STEP_DEFS = PHASE2_STEPS.map((s) => ({ id: s.id, label: s.label }));

/** Общая обвязка экранов-заглушек: фон, шапка и колонка по центру. */
export function Shell({ step, children }: { step?: number; children: React.ReactNode }) {
  return (
    <main className="min-h-screen relative">
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <Header showBack backHref="/create" />
      {step !== undefined && (
        <div className="relative z-10 mx-auto max-w-2xl px-6 pt-6">
          <FlowStepper currentStep={step} />
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">{children}</div>
    </main>
  );
}

export function LoadingScreen() {
  return (
    <Shell>
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-on-surface-subtle mx-auto mb-4" />
          <p className="text-on-surface-subtle">Загрузка...</p>
        </CardContent>
      </Card>
    </Shell>
  );
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <Shell>
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-red-400">Ошибка</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/create">
            <Button variant="outline" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Попробовать снова
            </Button>
          </Link>
        </CardContent>
      </Card>
    </Shell>
  );
}

export function NoDataScreen() {
  return (
    <Shell>
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-on-surface-muted">Данные не найдены</CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/create">
            <Button variant="outline" className="w-full">
              Загрузить документы
            </Button>
          </Link>
        </CardContent>
      </Card>
    </Shell>
  );
}

interface ProcessingScreenProps {
  currentStep: string | null;
  progress: number;
  error?: string;
  elapsedMs: number;
  onRetry: () => void;
}

/** Экран синхронного форматирования: анимированный прогресс вместо опроса статуса. */
export function ProcessingScreen({
  currentStep,
  progress,
  error,
  elapsedMs,
  onRetry,
}: ProcessingScreenProps) {
  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="w-10 h-10 bg-foreground flex items-center justify-center animate-pulse">
            <Sparkles className="w-5 h-5 text-background" />
          </div>
          Форматирование документа
        </CardTitle>
        <CardDescription>Применяем правила к вашему документу...</CardDescription>
      </CardHeader>
      <CardContent>
        <ProcessingStatus
          currentStep={currentStep}
          progress={progress}
          error={error}
          steps={PHASE2_STEP_DEFS}
          elapsedMs={elapsedMs}
          pageCount={30}
        />
        {error && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={onRetry}>
              Попробовать снова
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
