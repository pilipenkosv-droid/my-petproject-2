"use client";

import { useState, useEffect } from "react";
import { X, Users, Gift } from "lucide-react";
import { ShareButtons } from "@/components/ShareButtons";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/events";
import { SITE_URL } from "@/lib/config/site";
import Link from "next/link";

interface ShareResultPopupProps {
  jobId: string;
  violationsCount: number;
  fixesApplied: number;
  pageCount: number;
  workType?: string;
  /** Время обработки в секундах */
  processingSeconds?: number;
  /** Показывать только после скачивания документа */
  hasDownloaded: boolean;
}

function formatDurationRu(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} сек`;
  if (s === 0) return `${m} мин`;
  return `${m} мин ${s} сек`;
}

// Винительный падеж: "Оформил {что?}"
const WORK_TYPE_ACCUSATIVE: Record<string, string> = {
  diplom: "дипломную",
  kursovaya: "курсовую",
  referat: "реферат",
  otchet: "отчёт",
  dissertation: "диссертацию",
  vkr: "ВКР",
  doklad: "доклад",
  esse: "эссе",
};

// Именительный падеж: "Мой {что?} готов"
const WORK_TYPE_NOMINATIVE: Record<string, string> = {
  diplom: "диплом",
  kursovaya: "курсовая",
  referat: "реферат",
  otchet: "отчёт",
  dissertation: "диссертация",
  vkr: "ВКР",
  doklad: "доклад",
  esse: "эссе",
};

export function ShareResultPopup({
  jobId,
  violationsCount,
  fixesApplied,
  pageCount,
  workType,
  processingSeconds,
  hasDownloaded,
}: ShareResultPopupProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const storageKey = `dlx_shared_${jobId}`;
    if (localStorage.getItem(storageKey)) return;
    if (!hasDownloaded) return;

    // После скачивания ждём возврата на вкладку (пользователь посмотрел документ)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Небольшая задержка чтобы не выскакивать мгновенно
        setTimeout(() => {
          setIsVisible(true);
          trackEvent("share_popup_shown", { job_id: jobId, trigger: "tab_return" });
        }, 800);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };

    // Если вкладка уже видима (пользователь не уходил) — ставим слушатель на уход+возврат
    if (document.visibilityState === "visible") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    } else {
      // Вкладка уже скрыта — покажем при возврате
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [jobId, hasDownloaded]);

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem(`dlx_shared_${jobId}`, "1");
  };

  if (!isVisible) return null;

  const shareUrl = `${SITE_URL}/r/${jobId}`;
  const accLabel = workType ? WORK_TYPE_ACCUSATIVE[workType] || "работу" : "работу";
  const nomLabel = workType ? WORK_TYPE_NOMINATIVE[workType] || "работа" : "работа";
  const timeStr = processingSeconds && processingSeconds > 0 ? ` за ${formatDurationRu(processingSeconds)}` : "";
  const statsLine = fixesApplied > 0
    ? `\n*Исправлено ${fixesApplied} нарушений на ${pageCount} стр.`
    : `\n*${pageCount} стр. проверены и готовы к сдаче`;
  const shareTitle = `Оформил ${accLabel} в Diplox${timeStr}! Минус одна бессонная ночь. Готово к сдаче — а у тебя как?${statsLine}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-surface border border-surface-border shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-on-surface-muted hover:text-foreground transition-colors"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="text-center">
            <div className="w-12 h-12 bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground">
              −1 бессонная ночь 🌙
            </h3>
            {timeStr ? (
              <p className="text-sm text-on-surface-muted mt-1">
                Diplox оформил твою работу{timeStr}. Покажи одногруппникам.
              </p>
            ) : (
              <p className="text-sm text-on-surface-muted mt-1">
                Документ готов. Покажи одногруппникам, как легко оформить работу.
              </p>
            )}
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-hover border border-surface-border p-3 text-center">
              <div className="text-xl font-bold text-foreground">{pageCount}</div>
              <div className="text-xs text-on-surface-muted">страниц</div>
            </div>
            <div className="bg-surface-hover border border-surface-border p-3 text-center">
              <div className="text-xl font-bold text-emerald-400">{fixesApplied}</div>
              <div className="text-xs text-on-surface-muted">исправлений</div>
            </div>
          </div>

          {/* Share buttons */}
          <ShareButtons
            url={shareUrl}
            title={shareTitle}
            description="Автоматическое оформление по методичке — бесплатно"
          />

          {/* Referral teaser */}
          <div className="border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Gift className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Приглашай друзей — получи Pro бесплатно
                </p>
                <p className="text-xs text-on-surface-muted mt-1">
                  5 друзей = 1 месяц Pro. Реферальная ссылка — в профиле.
                </p>
                <Link href="/profile" onClick={handleClose}>
                  <Button variant="link" size="sm" className="px-0 mt-1 h-auto text-xs">
                    Перейти в профиль
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
