"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/events";

interface EmailGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  downloadType: "original" | "formatted";
}

export function EmailGateModal({
  isOpen,
  onClose,
  jobId,
  downloadType,
}: EmailGateModalProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  if (!isOpen) return null;

  function isValidEmail(value: string): boolean {
    return value.includes("@");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Введите корректный email");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/send-download-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, jobId, downloadType }),
      });

      if (!res.ok) throw new Error("Ошибка сервера");

      trackEvent("email_capture_submit", { download_type: downloadType });
      setSuccessEmail(email);
    } catch {
      setError("Не удалось отправить ссылку. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-surface-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {successEmail ? (
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">
              Ссылка отправлена на {successEmail}!
            </p>
            <p className="mt-1 text-sm text-foreground/60">
              Проверьте почту.
            </p>
            <Button className="mt-6 w-full" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-foreground">
              Скачайте результат
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Введите email — мы отправим ссылку для скачивания
            </p>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full border border-surface-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring"
              />

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? "Отправляем…" : "Отправить ссылку"}
              </Button>
            </form>

            <button
              onClick={onClose}
              className="mt-4 w-full text-center text-xs text-foreground/40 hover:text-foreground/60"
            >
              Отмена
            </button>
          </>
        )}
      </div>
    </div>
  );
}
