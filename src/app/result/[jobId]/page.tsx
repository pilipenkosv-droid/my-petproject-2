"use client";

import { use, useEffect, useRef } from "react";
import Link from "next/link";
import { useJobStatus } from "@/features/result/hooks/useJobStatus";
import { StatisticsPanel } from "@/features/result/components/StatisticsPanel";
import { CSATWidget } from "@/features/result/components/CSATWidget";
import { ProcessingStatus } from "@/features/constructor/components/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RefreshCw, Sparkles, CheckCircle, FileText, FileCheck, AlertTriangle, Gift, ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { FlowStepper } from "@/components/FlowStepper";
import { trackEvent } from "@/lib/analytics/events";

interface ResultPageProps {
  params: Promise<{ jobId: string }>;
}

export default function ResultPage({ params }: ResultPageProps) {
  const { jobId } = use(params);
  const { job, isLoading, error } = useJobStatus({ jobId });
  const trackedPreview = useRef(false);

  useEffect(() => {
    if (job?.status === "completed" && !trackedPreview.current) {
      trackedPreview.current = true;
      trackEvent("preview_view");
    }
  }, [job?.status]);

  const handleDownload = (type: "original" | "formatted") => {
    trackEvent("file_download", { download_type: type });
    const fileId = `${jobId}_${type}`;
    window.open(`/api/download/${fileId}`, "_blank");
  };

  // Состояние загрузки
  if (isLoading && !job) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-12 text-center">
              <div className="animate-pulse">
                <div className="h-4 bg-surface-hover rounded w-3/4 mx-auto mb-4"></div>
                <div className="h-4 bg-surface-hover rounded w-1/2 mx-auto"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Ошибка
  if (error) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header showBack backHref="/create" />
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
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

  // Обработка ещё идёт
  if (job?.status !== "completed" && job?.status !== "failed") {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header showBack backHref="/create" />
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                Обработка документа
              </CardTitle>
              <CardDescription>
                Пожалуйста, подождите...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProcessingStatus
                currentStep={job?.status as any}
                progress={job?.progress || 0}
                error={job?.error}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Обработка завершена с ошибкой
  if (job?.status === "failed") {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header showBack backHref="/create" />
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-red-400">Ошибка обработки</CardTitle>
              <CardDescription>{job.error || "Неизвестная ошибка"}</CardDescription>
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

  // Обработка завершена успешно
  return (
    <main className="min-h-screen relative">
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />

      <Header showBack backHref="/create" />

      <div className="relative z-10 mx-auto max-w-2xl px-6 pt-6">
        <FlowStepper currentStep={3} />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-6">
          {/* Success header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25 mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Документ успешно обработан
            </h2>
            <p className="text-on-surface-subtle">
              Проанализирован и отформатирован в соответствии с требованиями
            </p>
          </div>

          {/* Статистика */}
          {job.statistics && (
            <StatisticsPanel
              statistics={job.statistics}
              violationsCount={job.violationsCount ?? 0}
              fixesApplied={job.violationsCount ?? 0}
            />
          )}

          {/* Hook-offer: полная версия уже готова */}
          {job.statistics?.wasTruncated && job.hasFullVersion && (
            <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/20 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/2" />
              <CardContent className="pt-6 relative">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25 shrink-0">
                    <Gift className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground font-semibold text-lg mb-1">
                      Полная версия уже готова! 🎉
                    </p>
                    <p className="text-on-surface-muted text-sm mb-4">
                      Мы обработали весь ваш документ (~{job.statistics.originalPageCount} стр.), но показали только первые {job.statistics.pageLimitApplied}.
                      Получите полную версию прямо сейчас — без повторной обработки!
                    </p>
                    <Link href={`/pricing?unlock=${jobId}`}>
                      <Button variant="glow" className="group">
                        Получить полную версию
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Уведомление об обрезке документа (если нет полной версии) */}
          {job.statistics?.wasTruncated && !job.hasFullVersion && (
            <Card className="border-amber-500/30 bg-amber-500/10">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-foreground font-medium mb-1">
                      Обработаны первые {job.statistics.pageLimitApplied} из ~{job.statistics.originalPageCount} страниц
                    </p>
                    <p className="text-on-surface-muted text-sm">
                      В бесплатном тарифе доступна обработка до {job.statistics.pageLimitApplied} страниц.
                      Для обработки полного документа{" "}
                      <Link href="/pricing" className="text-primary hover:text-primary/80 underline">
                        приобретите тариф
                      </Link>.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Download section */}
          <Card>
            <CardHeader>
              <CardTitle>Скачать результаты</CardTitle>
              <CardDescription>
                Выберите нужную версию документа для скачивания
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Marked original */}
                <button
                  onClick={() => handleDownload("original")}
                  className="flex flex-col items-center gap-3 rounded-xl border border-surface-border bg-surface p-6 transition-all duration-200 hover:bg-surface-hover hover:border-surface-border text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">С пометками</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Исходный документ с выделенными нарушениями и комментариями
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-on-surface-subtle">
                    <Download className="h-3 w-3" />
                    <span>.docx</span>
                  </div>
                </button>

                {/* Formatted */}
                <button
                  onClick={() => handleDownload("formatted")}
                  className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 transition-all duration-200 hover:bg-emerald-500/10 hover:border-emerald-500/40 text-left ring-1 ring-emerald-500/20"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                    <FileCheck className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Исправленный</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Автоматически отформатированный документ, готовый к сдаче
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-emerald-400/70">
                    <Download className="h-3 w-3" />
                    <span>.docx</span>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* CSAT виджет */}
          <CSATWidget jobId={jobId} />

          {/* Ссылка на новый документ */}
          <div className="text-center pt-4">
            <Link href="/create">
              <Button variant="secondary">
                <RefreshCw className="h-4 w-4" />
                Загрузить новый документ
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

