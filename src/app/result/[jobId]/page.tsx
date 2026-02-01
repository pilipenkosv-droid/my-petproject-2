"use client";

import { use } from "react";
import Link from "next/link";
import { useJobStatus } from "@/features/result/hooks/useJobStatus";
import { StatisticsPanel } from "@/features/result/components/StatisticsPanel";
import { CSATWidget } from "@/features/result/components/CSATWidget";
import { ProcessingStatus } from "@/features/constructor/components/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, RefreshCw, Sparkles, CheckCircle, FileText, FileCheck } from "lucide-react";

interface ResultPageProps {
  params: Promise<{ jobId: string }>;
}

export default function ResultPage({ params }: ResultPageProps) {
  const { jobId } = use(params);
  const { job, isLoading, error } = useJobStatus({ jobId });

  const handleDownload = (type: "original" | "formatted") => {
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
                <div className="h-4 bg-white/10 rounded w-3/4 mx-auto mb-4"></div>
                <div className="h-4 bg-white/10 rounded w-1/2 mx-auto"></div>
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
        <Header />
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
        <Header />
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
        <Header />
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

      {/* Floating decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-64 h-64 bg-emerald-500/20 rounded-full blur-[100px] animate-pulse-glow" />
        <div className="absolute bottom-40 left-20 w-80 h-80 bg-violet-500/15 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: '2s' }} />
      </div>

      <Header />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-6">
          {/* Success header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25 mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Документ успешно обработан
            </h2>
            <p className="text-white/50">
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
                  className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-6 transition-all duration-200 hover:bg-white/10 hover:border-white/20 text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">С пометками</p>
                    <p className="text-xs text-white/40 mt-1">
                      Исходный документ с выделенными нарушениями и комментариями
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/50">
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
                    <p className="text-sm font-medium text-white">Исправленный</p>
                    <p className="text-xs text-white/40 mt-1">
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

function Header() {
  return (
    <header className="relative z-10 border-b border-white/10 bg-white/5 backdrop-blur-xl">
      <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-4">
        <Link
          href="/create"
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Link href="/" className="group">
          <h1 className="text-lg font-bold">
            <span className="gradient-text group-hover:opacity-80 transition-opacity">Smart</span>
            <span className="text-white group-hover:opacity-80 transition-opacity">Format</span>
          </h1>
          <p className="text-sm text-white/50">
            Результат обработки
          </p>
        </Link>
      </div>
    </header>
  );
}
