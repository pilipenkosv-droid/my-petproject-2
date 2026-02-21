"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { trackEvent } from "@/lib/analytics/events";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Mascot } from "@/components/Mascot";

type PaymentState = "polling" | "completed" | "failed" | "timeout";

const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 5 * 60 * 1000; // 5 минут

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = searchParams.get("invoiceId");

  const [state, setState] = useState<PaymentState>("polling");
  const [offerType, setOfferType] = useState<string | null>(null);

  const checkPayment = useCallback(async () => {
    if (!invoiceId) return null;

    try {
      const res = await fetch(`/api/payment/check/${invoiceId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch {
      return null;
    }
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceId) {
      setState("failed");
      return;
    }

    const startTime = Date.now();
    let timer: ReturnType<typeof setInterval>;

    const poll = async () => {
      if (Date.now() - startTime > MAX_POLL_TIME) {
        setState("timeout");
        clearInterval(timer);
        return;
      }

      const result = await checkPayment();
      if (!result) return;

      if (result.status === "completed") {
        setState("completed");
        setOfferType(result.offerType);
        trackEvent("payment_complete", { offer_type: result.offerType });
        clearInterval(timer);
      } else if (result.status === "failed") {
        setState("failed");
        clearInterval(timer);
      }
    };

    poll();
    timer = setInterval(poll, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, [invoiceId, checkPayment]);

  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <div className="text-center space-y-6">
        {state === "polling" && (
            <>
              <Mascot
                src="/mascot/waiting.png"
                alt="Диплодок ждёт оплату"
                width={406}
                height={344}
                className="mx-auto mb-4 w-24 sm:w-32 md:w-40"
              />
              <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto" />
              <h1 className="text-2xl font-bold text-foreground">
                Обрабатываем оплату...
              </h1>
              <p className="text-on-surface-muted">
                Пожалуйста, подождите. Обычно это занимает несколько секунд.
                <br />
                Не закрывайте эту страницу.
              </p>
            </>
          )}

          {state === "completed" && (
            <>
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
              <h1 className="text-2xl font-bold text-foreground">
                Оплата прошла успешно!
              </h1>
              <p className="text-on-surface-muted">
                {offerType === "subscription"
                  ? "Подписка активирована. Безлимитные обработки уже доступны."
                  : "Обработка документа добавлена в ваш аккаунт."}
              </p>
              <Button
                variant="glow"
                onClick={() => router.push("/")}
                className="mt-4"
              >
                Перейти к обработке
              </Button>
            </>
          )}

          {state === "failed" && (
            <>
              <XCircle className="w-16 h-16 text-red-400 mx-auto" />
              <h1 className="text-2xl font-bold text-foreground">
                Оплата не прошла
              </h1>
              <p className="text-on-surface-muted">
                Платёж не был завершён. Попробуйте ещё раз или выберите другой способ оплаты.
              </p>
              <Button
                variant="outline"
                onClick={() => router.push("/pricing")}
                className="mt-4"
              >
                Вернуться к тарифам
              </Button>
            </>
          )}

          {state === "timeout" && (
            <>
              <Clock className="w-16 h-16 text-amber-400 mx-auto" />
              <h1 className="text-2xl font-bold text-foreground">
                Ожидание подтверждения
              </h1>
              <p className="text-on-surface-muted">
                Платёж обрабатывается дольше обычного. Если деньги были списаны,
                доступ активируется автоматически в течение нескольких минут.
              </p>
              <div className="flex gap-3 justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={() => router.push("/")}
                >
                  На главную
                </Button>
                <Button
                  variant="glow"
                  onClick={() => {
                    setState("polling");
                    window.location.reload();
                  }}
                >
                  Проверить ещё раз
                </Button>
              </div>
            </>
          )}
      </div>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />
      <Suspense fallback={
        <main className="mx-auto max-w-lg px-6 py-24">
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-violet-400 animate-spin mx-auto" />
          </div>
        </main>
      }>
        <PaymentSuccessContent />
      </Suspense>
    </div>
  );
}
