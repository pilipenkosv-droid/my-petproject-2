"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useJobStatus } from "@/features/result/hooks/useJobStatus";
import { DualDocumentView } from "@/features/result/components/DualDocumentView";
import { StatisticsPanel } from "@/features/result/components/StatisticsPanel";
import { CSATWidget } from "@/features/result/components/CSATWidget";
import { ProcessingStatus } from "@/features/constructor/components/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, RefreshCw, Sparkles, CheckCircle } from "lucide-react";

interface ResultPageProps {
  params: Promise<{ jobId: string }>;
}

export default function ResultPage({ params }: ResultPageProps) {
  const { jobId } = use(params);
  const { job, isLoading, error } = useJobStatus({ jobId });
  
  const [originalHtml, setOriginalHtml] = useState("");
  const [formattedHtml, setFormattedHtml] = useState("");
  const [documentsLoading, setDocumentsLoading] = useState(false);

  // Загружаем HTML-превью документов после завершения обработки
  useEffect(() => {
    if (job?.status === "completed") {
      setDocumentsLoading(true);
      
      // Загружаем реальное превью документов
      const loadPreviews = async () => {
        try {
          const [originalRes, formattedRes] = await Promise.all([
            fetch(`/api/preview/${jobId}/original`),
            fetch(`/api/preview/${jobId}/formatted`),
          ]);

          if (originalRes.ok) {
            const originalData = await originalRes.json();
            setOriginalHtml(originalData.html);
          }
          
          if (formattedRes.ok) {
            const formattedData = await formattedRes.json();
            setFormattedHtml(formattedData.html);
          }
        } catch (error) {
          console.error("Error loading previews:", error);
          // Fallback на заглушку при ошибке
          setOriginalHtml(`<p>Не удалось загрузить превью. Скачайте документ для просмотра.</p>`);
          setFormattedHtml(`<p>Не удалось загрузить превью. Скачайте документ для просмотра.</p>`);
        } finally {
          setDocumentsLoading(false);
        }
      };

      loadPreviews();
    }
  }, [job?.status, jobId]);

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
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-red-400">Ошибка</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/constructor">
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
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
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
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-red-400">Ошибка обработки</CardTitle>
              <CardDescription>{job.error || "Неизвестная ошибка"}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/constructor">
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
      
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-8">
        <div className="space-y-6">
          {/* Заголовок и кнопки */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <CheckCircle className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Результат обработки</h2>
                <p className="text-white/50">
                  Документ успешно проанализирован и отформатирован
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => handleDownload("original")}
              >
                <Download className="h-4 w-4" />
                Скачать с пометками
              </Button>
              <Button 
                variant="glow"
                onClick={() => handleDownload("formatted")}
              >
                <Download className="h-4 w-4" />
                Скачать исправленный
              </Button>
            </div>
          </div>

          {/* Статистика */}
          {job.statistics && (
            <StatisticsPanel
              statistics={job.statistics}
              violationsCount={job.violationsCount ?? 0}
              fixesApplied={job.violationsCount ?? 0}
            />
          )}

          {/* Просмотр документов */}
          <DualDocumentView
            originalHtml={originalHtml}
            formattedHtml={formattedHtml}
            isLoading={documentsLoading}
          />

          {/* CSAT виджет */}
          <CSATWidget jobId={jobId} />

          {/* Ссылка на новый документ */}
          <div className="text-center pt-4">
            <Link href="/constructor">
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
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center gap-4">
        <Link 
          href="/constructor" 
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold">
            <span className="gradient-text">Smart</span>
            <span className="text-white">Formatter</span>
          </h1>
          <p className="text-sm text-white/50">
            Результат обработки
          </p>
        </div>
      </div>
    </header>
  );
}
