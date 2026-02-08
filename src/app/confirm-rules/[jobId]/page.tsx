"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormattingRules } from "@/types/formatting-rules";
import { RulesEditor } from "@/features/confirm-rules/components/RulesEditor";
import { GuidelinesChat } from "@/features/confirm-rules/components/GuidelinesChat";
import { ProcessingStatus } from "@/features/constructor/components/ProcessingStatus";
import { useAnimatedProgress, type AnimatedStep } from "@/features/constructor/hooks/useAnimatedProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import {
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Zap,
  RefreshCw,
  Loader2
} from "lucide-react";
import { Header } from "@/components/Header";
import { trackEvent } from "@/lib/analytics/events";

interface ConfirmRulesPageProps {
  params: Promise<{ jobId: string }>;
}

interface JobData {
  id: string;
  status: string;
  rules?: FormattingRules;
  confidence?: number;
  warnings?: string[];
  missingRules?: string[];
  hasGuidelinesText?: boolean;
}

const PHASE2_STEPS: AnimatedStep[] = [
  { id: "analyzing", label: "AI-разметка и проверка документа", rangeStart: 0, rangeEnd: 55 },
  { id: "formatting", label: "Применение форматирования", rangeStart: 55, rangeEnd: 90 },
  { id: "saving", label: "Сохранение результатов", rangeStart: 90, rangeEnd: 100 },
];

const PHASE2_STEP_DEFS = PHASE2_STEPS.map(s => ({ id: s.id, label: s.label }));

export default function ConfirmRulesPage({ params }: ConfirmRulesPageProps) {
  const { jobId } = use(params);
  const router = useRouter();

  const [job, setJob] = useState<JobData | null>(null);
  const [rules, setRules] = useState<FormattingRules | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const animatedProgress = useAnimatedProgress({
    steps: PHASE2_STEPS,
    minStepDuration: 1500,
  });

  // Загружаем данные задачи
  useEffect(() => {
    async function fetchJob() {
      try {
        const response = await fetch(`/api/status/${jobId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Задача не найдена");
            return;
          }
          throw new Error("Ошибка при получении данных");
        }

        const data = await response.json();

        if (data.status === "completed") {
          router.replace(`/result/${jobId}`);
          return;
        }

        if (data.status !== "awaiting_confirmation") {
          if (data.status === "failed") {
            setError(data.error || "Ошибка обработки");
            return;
          }
          router.replace(`/result/${jobId}`);
          return;
        }

        setJob(data);
        setRules(data.rules);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      } finally {
        setIsLoading(false);
      }
    }

    fetchJob();
  }, [jobId, router]);

  const handleConfirm = useCallback(async () => {
    if (!rules) return;

    setIsProcessing(true);
    setError(null);
    animatedProgress.start();
    trackEvent("processing_start");

    try {
      const response = await fetch("/api/confirm-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId,
          rules,
        }),
      });

      if (!response.ok) {
        // При таймауте (504) или серверной ошибке тело может быть не JSON
        let errorMessage = "Ошибка при обработке";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (response.status === 504) {
            errorMessage = "Превышено время ожидания. Попробуйте ещё раз — сервер перегружен.";
          } else if (response.status >= 500) {
            errorMessage = `Ошибка сервера (${response.status}). Попробуйте позже.`;
          }
        }
        throw new Error(errorMessage);
      }

      trackEvent("processing_complete");

      // Let animation finish, then redirect
      animatedProgress.complete(() => {
        router.push(`/result/${jobId}`);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      animatedProgress.fail(msg);
      setIsProcessing(false);
    }
  }, [rules, jobId, animatedProgress, router]);

  const handleRulesChange = (newRules: FormattingRules) => {
    setRules(newRules);
  };

  // Состояние загрузки
  if (isLoading) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header showBack backHref="/create" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-on-surface-subtle mx-auto mb-4" />
              <p className="text-on-surface-subtle">Загрузка...</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Ошибка (только если не в режиме обработки — ошибки обработки показываются в ProcessingStatus)
  if (error && !isProcessing) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header showBack backHref="/create" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-red-400">Ошибка</CardTitle>
              <CardDescription>{error}</CardDescription>
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
        </div>
      </main>
    );
  }

  // Нет данных
  if (!job || !rules) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header showBack backHref="/create" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
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
        </div>
      </main>
    );
  }

  // Processing state — full-screen progress view
  if (isProcessing) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header showBack backHref="/create" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                Форматирование документа
              </CardTitle>
              <CardDescription>
                Применяем правила к вашему документу...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProcessingStatus
                currentStep={animatedProgress.displayStep}
                progress={animatedProgress.displayProgress}
                error={animatedProgress.error}
                steps={PHASE2_STEP_DEFS}
              />
              {animatedProgress.error && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={() => {
                    setIsProcessing(false);
                    setError(null);
                  }}>
                    Попробовать снова
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />

      {/* Floating decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-[100px] animate-pulse-glow" />
        <div className="absolute bottom-40 left-20 w-80 h-80 bg-violet-500/15 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: '2s' }} />
      </div>

      <Header showBack backHref="/create" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8">
        <div className="space-y-6">
          {/* Заголовок */}
          <BlurFade delay={0.1} inView>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 mb-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">
                <span className="gradient-text">Проверьте</span>
                <span className="text-foreground"> требования к форматированию</span>
              </h2>
              <p className="text-on-surface-subtle max-w-md mx-auto">
                AI извлёк правила из вашей методички. Проверьте их и при необходимости скорректируйте перед обработкой документа.
              </p>
            </div>
          </BlurFade>

          {/* Редактор правил */}
          <BlurFade delay={0.2} inView>
            <RulesEditor
              rules={rules}
              onChange={handleRulesChange}
              warnings={job.warnings}
              missingRules={job.missingRules}
              confidence={job.confidence}
            />
          </BlurFade>

          {/* Чат с методичкой */}
          {job.hasGuidelinesText && (
            <BlurFade delay={0.25} inView>
              <GuidelinesChat jobId={jobId} />
            </BlurFade>
          )}

          {/* Кнопки действий */}
          <BlurFade delay={0.3} inView>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/create">
                <Button variant="secondary">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Загрузить другие документы
                </Button>
              </Link>

              <ShimmerButton
                onClick={handleConfirm}
              >
                <Zap className="w-5 h-5 mr-2" />
                Подтвердить и обработать
              </ShimmerButton>
            </div>
          </BlurFade>
        </div>
      </div>
    </main>
  );
}

