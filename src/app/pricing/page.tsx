"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, GraduationCap, Gift, FileCheck, Bot } from "lucide-react";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { BorderBeam } from "@/components/ui/border-beam";

import { PricingFaq } from "@/components/PricingFaq";
import { trackEvent } from "@/lib/analytics/events";

interface PlanFeature {
  text: string;
  highlight?: boolean;
  icon?: typeof Sparkles;
}

const plans = [
  {
    id: "trial" as const,
    name: "Пробный",
    price: "0 ₽",
    period: "первый документ",
    icon: Gift,
    description: "Попробуйте бесплатно",
    features: [
      { text: "1 бесплатная обработка" },
      { text: "50% документа бесплатно" },
      { text: "AI-анализ структуры" },
      { text: "Форматирование по ГОСТу" },
      { text: "Базовые инструменты" },
      { text: "Без регистрации" },
    ] as PlanFeature[],
    accent: false,
    badge: null,
  },
  {
    id: "one_time" as const,
    name: "Разовая",
    price: "159 ₽",
    period: "за 1 документ",
    icon: Zap,
    description: "Обработка одного документа",
    features: [
      { text: "1 обработка документа" },
      { text: "Без ограничения по страницам" },
      { text: "AI-анализ структуры" },
      { text: "Форматирование по ГОСТу" },
      { text: "Базовые инструменты" },
      { text: "Скачивание результата" },
    ] as PlanFeature[],
    accent: false,
    badge: "Популярно",
  },
  {
    id: "subscription" as const,
    name: "Pro",
    price: "399 ₽",
    period: "/ месяц",
    icon: GraduationCap,
    description: "10 обработок по цене двух",
    features: [
      { text: "10 обработок/мес — 39 ₽ за документ", highlight: true, icon: Sparkles },
      { text: "Все инструменты без ограничений", highlight: true },
      { text: "Форматирование, грамматика, рерайт, конспект" },
      { text: "Поиск научных источников" },
      { text: "Без ограничения по страницам" },
      { text: "Приоритетная обработка" },
    ] as PlanFeature[],
    accent: false,
    badge: "Выгоднее в 4 раза",
  },
  {
    id: "subscription_plus" as const,
    name: "Pro Plus",
    price: "1 499 ₽",
    period: "/ месяц",
    icon: Bot,
    description: "Pro + AI-напарник в Telegram",
    features: [
      { text: "AI-напарник в Telegram — помощник по учёбе", highlight: true, icon: Bot },
      { text: "Всё из тарифа Pro", highlight: true },
      { text: "10 обработок/мес — 39 ₽ за документ" },
      { text: "Все инструменты без ограничений" },
      { text: "Приоритетная обработка" },
    ] as PlanFeature[],
    accent: true,
    badge: null,
  },
];

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const proCardRef = useRef<HTMLDivElement>(null);

  // Если есть параметр unlock — пользователь пришёл разблокировать полную версию документа
  const unlockJobId = searchParams.get("unlock");
  const refParam = searchParams.get("ref");
  const fromBot = refParam === "bot";

  const proTracked = useRef(false);

  useEffect(() => {
    if (fromBot && proCardRef.current) {
      proCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [fromBot]);

  useEffect(() => {
    const el = proCardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !proTracked.current) {
          proTracked.current = true;
          trackEvent("subscription_pro_view", { ref: refParam || "direct" });
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [refParam]);

  const handlePurchase = async (offerType: "trial" | "one_time" | "subscription" | "subscription_plus") => {
    if (offerType === "trial") {
      router.push(user ? "/create" : "/login?redirect=/create");
      return;
    }

    if (!user) {
      const redirectUrl = unlockJobId ? `/pricing?unlock=${unlockJobId}` : "/pricing";
      router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    setLoading(offerType);
    trackEvent("payment_init", { offer_type: offerType });

    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerType,
          // Передаём jobId для разблокировки после оплаты
          ...(unlockJobId && { unlockJobId }),
        }),
      });

      const data = await res.json();

      if (data.paymentUrl && data.invoiceId) {
        // Открываем оплату в новой вкладке, а текущую перенаправляем на страницу ожидания
        window.open(data.paymentUrl, "_blank");
        // Если разблокируем конкретный документ — передаём jobId на страницу успеха
        const successUrl = unlockJobId
          ? `/payment/success?invoiceId=${data.invoiceId}&unlockJob=${unlockJobId}`
          : `/payment/success?invoiceId=${data.invoiceId}`;
        router.push(successUrl);
      } else {
        console.error("No payment URL:", data);
        alert("Не удалось создать платёж. Попробуйте снова.");
      }
    } catch (error) {
      console.error("Purchase error:", error);
      alert("Ошибка при создании платежа");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      <PageHero
        badge={
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted border border-border text-primary text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            Тарифы
          </div>
        }
        title="Выберите подходящий тариф"
        subtitle="Разовая обработка — 159 ₽. С подпиской — от 39 ₽ за документ"
      />

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Баннер бота — когда пришли с /bot */}
        {fromBot && (
          <div className="mb-8 p-4 bg-purple-500/10 border border-purple-500/30 text-sm text-on-surface-muted">
            При оформлении Pro Plus ты автоматически получишь доступ к AI-напарнику и ссылку на бота.
          </div>
        )}

        {/* Баннер разблокировки полной версии */}
        {unlockJobId && (
          <div className="mb-8 p-6 bg-muted border border-border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-foreground flex items-center justify-center shrink-0">
                <FileCheck className="w-6 h-6 text-background" />
              </div>
              <div>
                <p className="text-foreground font-semibold">Разблокировка полной версии документа</p>
                <p className="text-on-surface-muted text-sm">
                  После оплаты любого тарифа вы сразу получите доступ к полной версии вашего обработанного документа
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Платные тарифы — 3 в ряд */}
        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.filter((p) => p.id !== "trial").map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.id}
                ref={plan.id === (fromBot ? "subscription_plus" : "subscription") ? proCardRef : undefined}
                className={`relative flex flex-col transition-all ${
                  plan.accent
                    ? "bg-muted shadow-sm border-purple-500/50 ring-1 ring-purple-500/20"
                    : "bg-surface border-surface-border opacity-[0.9]"
                }`}
              >
                {plan.badge && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold z-10 ${
                    plan.accent
                      ? "bg-foreground text-background"
                      : "bg-muted border border-border text-foreground"
                  }`}>
                    {plan.badge}
                  </span>
                )}

                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className={`w-5 h-5 ${plan.accent ? "text-primary" : "text-on-surface-muted"}`} />
                    <CardTitle className={`text-foreground text-lg ${plan.accent ? "font-extrabold" : ""}`}>{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col flex-1 space-y-6">
                  {/* Цена */}
                  <div>
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-on-surface-subtle ml-1">{plan.period}</span>
                  </div>

                  {/* Экономия — для Pro и Pro Plus */}
                  {(plan.id === "subscription" || plan.id === "subscription_plus") && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                      <Sparkles className="w-3 h-3 shrink-0" />
                      {plan.id === "subscription_plus"
                        ? "Всё из Pro + AI-напарник по учёбе"
                        : "39 ₽/документ вместо 159 ₽ — экономия 75%"}
                    </div>
                  )}

                  {/* Фичи */}
                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feature) => {
                      const FeatureIcon = feature.icon || Check;
                      return (
                        <li
                          key={feature.text}
                          className={`flex items-center gap-3 text-sm ${
                            feature.highlight ? "text-foreground font-medium" : "text-on-surface"
                          }`}
                        >
                          <FeatureIcon className={`w-4 h-4 shrink-0 ${
                            feature.highlight ? "text-purple-400" : "text-emerald-400"
                          }`} />
                          {feature.text}
                        </li>
                      );
                    })}
                  </ul>

                  {/* Кнопка */}
                  {plan.accent ? (
                    <div className="relative inline-flex overflow-hidden rounded-lg w-full">
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => handlePurchase(plan.id)}
                        disabled={loading !== null}
                      >
                        {loading === plan.id ? "Перенаправление..." : "Оформить подписку"}
                      </Button>
                      {loading !== plan.id && (
                        <BorderBeam
                          size={80}
                          duration={5}
                          colorFrom="#a855f7"
                          colorTo="#6366f1"
                          borderWidth={2}
                        />
                      )}
                    </div>
                  ) : (
                    <Button
                      className="w-full rounded-none"
                      variant="outline"
                      onClick={() => handlePurchase(plan.id)}
                      disabled={loading !== null}
                    >
                      {loading === plan.id
                        ? "Перенаправление..."
                        : plan.id === "subscription"
                          ? "Оформить подписку"
                          : "Купить"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Подсказка */}
        <div className="text-center mt-8">
          <p className="text-muted-foreground text-sm">
            Отмена подписки в любой момент
          </p>
        </div>

        {/* Бесплатная попытка */}
        <div className="mt-10 max-w-4xl mx-auto p-6 bg-surface border border-surface-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Gift className="w-8 h-8 text-on-surface-muted shrink-0" />
              <div>
                <p className="text-foreground font-semibold">Попробуйте бесплатно</p>
                <p className="text-on-surface-muted text-sm">
                  1 обработка документа (50% страниц) — без регистрации и оплаты
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => handlePurchase("trial")}
              className="shrink-0"
            >
              Попробовать бесплатно
            </Button>
          </div>
        </div>

        <PricingFaq />
      </main>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen">
        <Header showBack backHref="/" />
        <main className="mx-auto max-w-4xl px-6 py-16">
          <div className="text-center">
            <div className="animate-pulse">
              <div className="h-8 bg-surface-hover rounded w-48 mx-auto mb-4"></div>
              <div className="h-4 bg-surface-hover rounded w-64 mx-auto"></div>
            </div>
          </div>
        </main>
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
