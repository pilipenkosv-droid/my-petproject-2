"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useJobStatus } from "@/features/result/hooks/useJobStatus";
import { StatisticsPanel } from "@/features/result/components/StatisticsPanel";
import { CSATWidget } from "@/features/result/components/CSATWidget";
import { CSATReturnVisitModal } from "@/features/result/components/CSATReturnVisitModal";
import { EmailGateModal } from "@/features/result/components/EmailGateModal";
import { ProcessingStatus } from "@/features/constructor/components/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RefreshCw, Sparkles, CheckCircle, FileText, FileCheck, AlertTriangle, Gift, ArrowRight, Clock } from "lucide-react";

import { Header } from "@/components/Header";
import { FlowStepper } from "@/components/FlowStepper";
import { CrossSellCtas } from "@/features/result/components/CrossSellCtas";
import { ChangesSummary } from "@/features/result/components/ChangesSummary";
import { ProUpsellBanner } from "@/features/result/components/ProUpsellBanner";
import { ShareResultPopup } from "@/features/result/components/ShareResultPopup";
import { GroupLinkCard } from "@/features/group/components/GroupLinkCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { trackEvent } from "@/lib/analytics/events";

interface ResultPageProps {
  params: Promise<{ jobId: string }>;
}

export default function ResultPage({ params }: ResultPageProps) {
  const { jobId } = use(params);
  const { job, isLoading, error } = useJobStatus({ jobId });
  const { user } = useAuth();
  const trackedPreview = useRef(false);
  const [emailGateOpen, setEmailGateOpen] = useState(false);
  const [emailGateDownloadType, setEmailGateDownloadType] = useState<"original" | "formatted">("formatted");
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [flowTimeSec, setFlowTimeSec] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`dlx_flow_time_${jobId}`);
      if (stored) {
        const n = parseInt(stored, 10);
        if (n > 0) setFlowTimeSec(n);
      }
    } catch {}
  }, [jobId]);

  useEffect(() => {
    if (job?.status === "completed" && !trackedPreview.current) {
      trackedPreview.current = true;
      trackEvent("preview_view");
    }
  }, [job?.status]);

  const handleDownload = (type: "original" | "formatted") => {
    trackEvent("file_download", { download_type: type, is_anon: !user });
    const fileId = `${jobId}_${type}`;
    window.open(`/api/download/${fileId}`, "_blank");
    setHasDownloaded(true);
    // Для анонимных — предлагаем отправить копию на почту ПОСЛЕ скачивания
    if (!user) {
      setEmailGateDownloadType(type);
      setEmailGateOpen(true);
    }
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
                <div className="h-4 bg-surface-hover w-3/4 mx-auto mb-4"></div>
                <div className="h-4 bg-surface-hover w-1/2 mx-auto"></div>
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
                <div className="w-10 h-10 bg-foreground flex items-center justify-center animate-pulse">
                  <Sparkles className="w-5 h-5 text-background" />
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
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Документ успешно обработан
            </h2>
            <p className="text-on-surface-subtle">
              Проанализирован и отформатирован в соответствии с требованиями
            </p>
            {(() => {
              const totalSec = flowTimeSec
                ?? (job.statistics?.pipelineTimeMs ? Math.round(job.statistics.pipelineTimeMs / 1000) : 0);
              if (totalSec <= 0) return null;
              const m = Math.floor(totalSec / 60);
              const s = totalSec % 60;
              const label = m === 0 ? `${s} сек` : s === 0 ? `${m} мин` : `${m} мин ${s} сек`;
              return (
                <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary/10 border border-primary/30">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">
                    Обработано за <span className="font-semibold">{label}</span>
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Статистика */}
          {job.statistics && (
            <StatisticsPanel
              statistics={job.statistics}
              violationsCount={job.violationsCount ?? 0}
              fixesApplied={job.fixesApplied ?? 0}
            />
          )}

          {/* Сводка изменений — что конкретно было исправлено */}
          {job.changesSummary && job.changesSummary.length > 0 && (
            <ChangesSummary
              changes={job.changesSummary}
              totalFixes={job.fixesApplied ?? 0}
            />
          )}

          {/* Hook-offer: полная версия уже готова */}
          {job.statistics?.wasTruncated && job.hasFullVersion && !job.paymentCompleted && (
            <Card className="border-border bg-muted overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-muted rounded-full blur-[60px] -translate-y-1/2 translate-x-1/2" />
              <CardContent className="pt-6 relative">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-foreground flex items-center justify-center shadow-sm shrink-0">
                    <Gift className="w-6 h-6 text-background" />
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground font-semibold text-lg mb-1">
                      Полная версия уже готова!
                    </p>
                    <p className="text-on-surface-muted text-sm mb-4">
                      {(job.violationsCount ?? 0) > 0
                        ? `Найдено ${job.violationsCount} нарушений на ~${job.statistics.originalPageCount} стр. — все уже исправлены. Вы видите ${job.statistics.pageLimitApplied} из ${job.statistics.originalPageCount} стр., остальное доступно после оплаты.`
                        : `Мы обработали весь ваш документ (~${job.statistics.originalPageCount} стр.), но показали ${job.statistics.pageLimitApplied} из ${job.statistics.originalPageCount}. Получите полную версию прямо сейчас.`
                      }
                    </p>
                    <Link href={`/pricing?unlock=${jobId}`}>
                      <Button variant="glow" className="group">
                        Получить полную версию — 159 ₽
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
                      Обработаны {job.statistics.pageLimitApplied} из ~{job.statistics.originalPageCount} страниц
                    </p>
                    <p className="text-on-surface-muted text-sm">
                      Бесплатно доступно 50% документа.
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
                Для сдачи скачайте <strong>Исправленный</strong> — в нём уже применено форматирование
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Formatted — primary action, shown first on mobile */}
                <button
                  onClick={() => handleDownload("formatted")}
                  className="relative flex flex-col items-center gap-3 border border-emerald-500/40 bg-emerald-500/5 p-6 transition-all duration-200 hover:bg-emerald-500/10 hover:border-emerald-500/60 text-left ring-1 ring-emerald-500/20 order-first sm:order-last"
                >
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold bg-emerald-500 text-white px-3 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                    Скачать для сдачи
                  </span>
                  <div className="w-12 h-12 bg-foreground flex items-center justify-center shadow-sm">
                    <FileCheck className="w-6 h-6 text-background" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Исправленный</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Форматирование уже применено — шрифты, отступы, интервалы
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-emerald-600">
                    <Download className="h-3 w-3" />
                    <span>.docx</span>
                  </div>
                </button>

                {/* Marked original — secondary */}
                <button
                  onClick={() => handleDownload("original")}
                  className="flex flex-col items-center gap-3 border border-surface-border bg-surface p-6 transition-all duration-200 hover:bg-surface-hover hover:border-surface-border text-left"
                >
                  <div className="w-12 h-12 bg-foreground flex items-center justify-center shadow-sm">
                    <FileText className="w-6 h-6 text-background" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">С пометками</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Для просмотра: исходный файл с выделенными нарушениями
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-on-surface-subtle">
                    <Download className="h-3 w-3" />
                    <span>.docx</span>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* CSAT виджет — показываем только после скачивания */}
          {hasDownloaded && !job.statistics?.wasTruncated && (
            <CSATWidget
              jobId={jobId}
              workType={job.workType}
              requirementsMode={job.requirementsMode}
              wasTruncated={job.statistics?.wasTruncated}
              source="after_download"
            />
          )}

          {/* Групповая ссылка */}
          <GroupLinkCard userId={user?.id} />

          {/* Апселл Pro-подписки */}
          <ProUpsellBanner />

          <CrossSellCtas />

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

      {/* Share popup после завершения */}
      {job.status === "completed" && (
        <ShareResultPopup
          jobId={jobId}
          violationsCount={job.violationsCount ?? 0}
          fixesApplied={job.fixesApplied ?? 0}
          pageCount={job.statistics?.pageCount ?? 0}
          workType={job.workType}
          processingSeconds={
            flowTimeSec
              ?? (job.statistics?.pipelineTimeMs
                ? Math.round(job.statistics.pipelineTimeMs / 1000)
                : job.createdAt && job.updatedAt
                  ? Math.round((new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime()) / 1000)
                  : undefined)
          }
          hasDownloaded={hasDownloaded}
        />
      )}

      {/* CSAT модалка для повторных визитов (не для truncated) */}
      {job.status === "completed" && !job.statistics?.wasTruncated && (
        <CSATReturnVisitModal jobId={jobId} />
      )}

      {/* Email-gate для анонимных скачиваний */}
      <EmailGateModal
        isOpen={emailGateOpen}
        onClose={() => setEmailGateOpen(false)}
        jobId={jobId}
        downloadType={emailGateDownloadType}
      />
    </main>
  );
}

