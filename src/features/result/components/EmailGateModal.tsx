"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/events";

export type EmailGateSource =
  | { kind: "job"; jobId: string; downloadType: "original" | "formatted" }
  | {
      kind: "tool";
      outputId: string;
      tool: "rewrite" | "summarize" | "outline" | "ask-guidelines";
    };

interface EmailGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: EmailGateSource;
}

export function EmailGateModal({
  isOpen,
  onClose,
  source,
}: EmailGateModalProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && source.kind === "tool") {
      trackEvent("tool_email_gate_opened", {
        tool: source.tool,
        outputId: source.outputId,
      });
    }
  }, [isOpen, source]);

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
      let res: Response;
      if (source.kind === "job") {
        res = await fetch("/api/send-download-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            jobId: source.jobId,
            downloadType: source.downloadType,
          }),
        });
      } else {
        res = await fetch("/api/tool-output/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, outputId: source.outputId }),
        });
      }

      if (!res.ok) throw new Error("Ошибка сервера");

      if (source.kind === "job") {
        trackEvent("email_capture_submit", {
          download_type: source.downloadType,
        });
      } else {
        trackEvent("tool_email_submitted", { tool: source.tool });
      }
      setSuccessEmail(email);
    } catch {
      setError("Не удалось отправить ссылку. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  }

  const heading =
    source.kind === "job" ? "Файл скачан!" : "Отправить полную версию?";
  const subheading =
    source.kind === "job"
      ? "Отправить копию на почту, чтобы не потерять?"
      : "Пришлём ссылку на полный результат — он будет доступен 7 дней.";

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
            <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
            <p className="mt-1 text-sm text-foreground/60">{subheading}</p>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full border border-surface-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring"
              />

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? "Отправляем…" : "Отправить ссылку"}
              </Button>
            </form>

            <button
              onClick={onClose}
              className="mt-4 w-full text-center text-xs text-foreground/40 hover:text-foreground/60"
            >
              Нет, спасибо
            </button>
          </>
        )}
      </div>
    </div>
  );
}
