"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormattingRules } from "@/types/formatting-rules";
import { RulesEditor } from "@/features/confirm-rules/components/RulesEditor";
import { ConfirmRulesWaiting } from "@/features/confirm-rules/components/ConfirmRulesWaiting";
import { GuidelinesChat } from "@/features/confirm-rules/components/GuidelinesChat";
import { useAnimatedProgress } from "@/features/constructor/hooks/useAnimatedProgress";
import { useJobStatus } from "@/features/result/hooks/useJobStatus";
import {
  ErrorScreen,
  LoadingScreen,
  NoDataScreen,
  ProcessingScreen,
  Shell,
  PHASE2_STEPS,
} from "./screens";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/ui/blur-fade";
import { ArrowLeft, CheckCircle, Zap } from "lucide-react";
import { Header } from "@/components/Header";
import { FlowStepper } from "@/components/FlowStepper";
import { trackEvent } from "@/lib/analytics/events";

interface ConfirmRulesPageProps {
  params: Promise<{ jobId: string }>;
}

/** Поля, которые /api/status отдаёт только для статуса awaiting_confirmation. */
interface ConfirmJobExtras {
  confidence?: number;
  hasGuidelinesText?: boolean;
}

/** Опрос идёт, пока методичку разбирает воркер; awaiting_confirmation — наша остановка. */
const STOP_ON_STATUS = ["awaiting_confirmation", "completed", "failed"];
/** Тот же потолок, что у страницы результата: у воркера нет лимита в 60 с. */
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;

export default function ConfirmRulesPage({ params }: ConfirmRulesPageProps) {
  const { jobId } = use(params);
  const router = useRouter();

  const { job: rawJob, isLoading, error: statusError } = useJobStatus({
    jobId,
    stopOnStatus: STOP_ON_STATUS,
    timeout: WAIT_TIMEOUT_MS,
  });
  const job = rawJob as (typeof rawJob & ConfirmJobExtras) | null;

  const [rules, setRules] = useState<FormattingRules | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const animatedProgress = useAnimatedProgress({
    steps: PHASE2_STEPS,
    minTotalDuration: 60000,
    totalJitter: 30000,
  });

  // Реакция на статус: готовые правила — в форму, терминальные статусы — дальше
  useEffect(() => {
    if (!job) return;

    if (job.status === "completed") {
      router.replace(`/result/${jobId}`);
      return;
    }

    if (job.status === "failed") {
      setError(job.error || "Ошибка обработки");
      return;
    }

    if (job.status === "awaiting_confirmation" && job.rules) {
      // Правки пользователя не затираем очередным ответом опроса.
      setRules((prev) => prev ?? job.rules ?? null);
    }
  }, [job, jobId, router]);

  const handleConfirm = useCallback(async () => {
    if (!rules) return;

    setIsProcessing(true);
    setError(null);
    const flowStartedAt = Date.now();
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

      // 202 — документ форматирует воркер. Ждать анимацию незачем: стадии
      // обработки показывает страница результата, она сама опрашивает статус.
      if (response.status === 202) {
        router.push(`/result/${jobId}`);
        return;
      }

      // Let animation finish, then redirect
      animatedProgress.complete(() => {
        try {
          const finalSec = Math.max(1, Math.round((Date.now() - flowStartedAt) / 1000));
          const prev = parseInt(localStorage.getItem(`dlx_flow_time_${jobId}`) || "0", 10) || 0;
          localStorage.setItem(`dlx_flow_time_${jobId}`, String(prev + finalSec));
        } catch {}
        router.push(`/result/${jobId}`);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      animatedProgress.fail(msg);
      // НЕ сбрасываем isProcessing — ProcessingScreen покажет ошибку
      // с кнопкой «Попробовать снова» (которая и вызовет setIsProcessing(false))
    }
  }, [rules, jobId, animatedProgress, router]);

  const handleRulesChange = (newRules: FormattingRules) => {
    setRules(newRules);
  };

  // Первая загрузка статуса
  if (isLoading && !job) return <LoadingScreen />;

  // Ошибка (только если не в режиме обработки — ошибки обработки показывает
  // ProcessingScreen). Обрыв опроса не фатален, пока задача уже загружена.
  const fatalError = error ?? (job ? null : statusError);
  if (fatalError && !isProcessing) return <ErrorScreen message={fatalError} />;

  // Processing state — full-screen progress view
  if (isProcessing) {
    return (
      <Shell step={2}>
        <ProcessingScreen
          currentStep={animatedProgress.displayStep}
          progress={animatedProgress.displayProgress}
          error={animatedProgress.error}
          elapsedMs={animatedProgress.elapsedMs}
          onRetry={() => {
            setIsProcessing(false);
            setError(null);
          }}
        />
      </Shell>
    );
  }

  // Задача ещё в работе: методичку разбирает воркер или инлайн-запрос
  if (job && job.status !== "awaiting_confirmation") {
    return (
      <Shell>
        <ConfirmRulesWaiting message={job.statusMessage || "Разбираем методичку"} />
      </Shell>
    );
  }

  if (!job || !rules) return <NoDataScreen />;

  return (
    <main className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />

      <Header showBack backHref="/create" />

      <div className="relative z-10 mx-auto max-w-2xl px-6 pt-6">
        <FlowStepper currentStep={1} />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8">
        <div className="space-y-6">
          {/* Заголовок */}
          <BlurFade delay={0.1} inView>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-foreground shadow-sm mb-4">
                <CheckCircle className="w-8 h-8 text-background" />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-foreground">
                Проверьте требования к форматированию
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

              <Button size="lg"
                onClick={handleConfirm}
              >
                <Zap className="w-5 h-5 mr-2" />
                Подтвердить и обработать
              </Button>
            </div>
          </BlurFade>
        </div>
      </div>
    </main>
  );
}
