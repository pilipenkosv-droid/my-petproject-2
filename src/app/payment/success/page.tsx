"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { trackEvent } from "@/lib/analytics/events";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Clock, MessageCircle, Gift } from "lucide-react";
import { ShareButtons } from "@/components/ShareButtons";


type PaymentState = "polling" | "completed" | "failed" | "timeout";

const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 10 * 60 * 1000; // 10 минут
const LONG_WAIT_THRESHOLD = 60 * 1000; // 60 секунд

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = searchParams.get("invoiceId");

  const [state, setState] = useState<PaymentState>("polling");
  const [offerType, setOfferType] = useState<string | null>(null);
  const [botDeepLink, setBotDeepLink] = useState<string | null>(null);
  const [longWait, setLongWait] = useState(false);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);

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
      const elapsed = Date.now() - startTime;
      if (elapsed > LONG_WAIT_THRESHOLD) {
        setLongWait(true);
      }
      if (elapsed > MAX_POLL_TIME) {
        setState("timeout");
        clearInterval(timer);
        return;
      }

      const result = await checkPayment();
      if (!result) return;

      if (result.status === "completed") {
        setState("completed");
        setOfferType(result.offerType);
        if (result.botDeepLink) {
          setBotDeepLink(result.botDeepLink);
        }
        trackEvent("payment_complete", { offer_type: result.offerType });
        // Загружаем реферальную ссылку для CTA
        fetch("/api/referral/stats")
          .then((r) => r.ok ? r.json() : null)
          .then((data) => { if (data?.referralUrl) setReferralUrl(data.referralUrl); })
          .catch(() => {});
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
              <Loader2 className="w-10 h-10 text-foreground animate-spin mx-auto" />
              <h1 className="text-2xl font-bold text-foreground">
                Обрабатываем оплату...
              </h1>
              {longWait ? (
                <div className="space-y-3">
                  <p className="text-on-surface-muted">
                    Платёж обрабатывается. Если деньги были списаны, доступ откроется автоматически в течение 5 минут.
                  </p>
                  <p className="text-on-surface-muted text-sm">
                    Можете обновить страницу позже или написать нам: <a href="mailto:hello@diplox.online" className="text-primary hover:underline">hello@diplox.online</a>
                  </p>
                </div>
              ) : (
                <p className="text-on-surface-muted">
                  Пожалуйста, подождите. Обычно это занимает несколько секунд.
                  <br />
                  Не закрывайте эту страницу.
                </p>
              )}
            </>
          )}

          {state === "completed" && (
            <>
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
              <h1 className="text-2xl font-bold text-foreground">
                Оплата прошла успешно!
              </h1>
              <p className="text-on-surface-muted">
                {offerType === "subscription_plus"
                  ? "Подписка Pro Plus активирована! 10 обработок + AI-напарник."
                  : offerType === "subscription"
                    ? "Подписка Pro активирована. 10 обработок в месяц уже доступны."
                    : "Обработка документа добавлена в ваш аккаунт."}
              </p>

              {botDeepLink && (
                <div className="mt-6 p-4 border border-border bg-muted">
                  <p className="text-sm text-on-surface-muted mb-3">
                    🎉 Вам доступен <strong>Diplox AI-бот</strong> в Telegram — ваш личный помощник для учёбы!
                  </p>
                  <Button
                    variant="glow"
                    onClick={() => window.open(botDeepLink, "_blank")}
                    className="w-full"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Открыть бота в Telegram
                  </Button>
                </div>
              )}

              <Button
                variant={botDeepLink ? "outline" : "glow"}
                onClick={() => router.push("/create")}
                className="mt-4"
              >
                Перейти к обработке
              </Button>

              {/* Реферальный CTA — момент наибольшего удовлетворения */}
              {referralUrl && (
                <div className="mt-8 p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 text-left space-y-3">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-violet-400" />
                    <p className="text-sm font-medium text-foreground">
                      Пригласи друга — получи бесплатную обработку
                    </p>
                  </div>
                  <p className="text-xs text-on-surface-muted">
                    За каждого друга +1 обработка. За 5 друзей — месяц Pro.
                  </p>
                  <ShareButtons
                    variant="compact"
                    url={referralUrl}
                    title="Попробуй Diplox — сервис оформления учебных работ по ГОСТу"
                  />
                </div>
              )}
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
            <Loader2 className="w-16 h-16 text-foreground animate-spin mx-auto" />
          </div>
        </main>
      }>
        <PaymentSuccessContent />
      </Suspense>
    </div>
  );
}
