"use client";

import { useEffect, useState } from "react";
import { CSATWidget } from "./CSATWidget";
import { X } from "lucide-react";

interface CSATReturnVisitModalProps {
  jobId: string;
}

/**
 * Модалка CSAT для возвращающихся пользователей.
 * Показывается при повторном визите на страницу результата,
 * если пользователь ещё не оставлял оценку для этого job.
 */
export function CSATReturnVisitModal({ jobId }: CSATReturnVisitModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const csatKey = `dlx_csat_shown_${jobId}`;
    const visitKey = `dlx_visited_${jobId}`;

    // Если уже оценивал — не показываем
    if (localStorage.getItem(csatKey)) return;

    // Первый визит — запоминаем, не показываем
    if (!sessionStorage.getItem(visitKey)) {
      sessionStorage.setItem(visitKey, "1");
      return;
    }

    // Повторный визит — показываем с задержкой
    const timer = setTimeout(() => setIsOpen(true), 2000);
    return () => clearTimeout(timer);
  }, [jobId]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSubmit = () => {
    localStorage.setItem(`dlx_csat_shown_${jobId}`, "1");
    setTimeout(() => setIsOpen(false), 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={handleClose}
          className="absolute -top-2 -right-2 z-10 w-8 h-8 bg-surface border border-surface-border flex items-center justify-center hover:bg-surface-hover transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <CSATWidget
          jobId={jobId}
          title="Как прошла сдача?"
          source="return_visit"
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
