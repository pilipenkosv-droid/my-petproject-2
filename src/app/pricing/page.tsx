"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, Crown, Gift, HelpCircle, FileCheck } from "lucide-react";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { trackEvent } from "@/lib/analytics/events";

const plans = [
  {
    id: "trial" as const,
    name: "Пробный",
    price: "0 ₽",
    period: "первый документ",
    icon: Gift,
    description: "Попробуйте бесплатно",
    features: [
      "1 бесплатная обработка",
      "Первые 30 страниц документа",
      "AI-анализ структуры",
      "Форматирование по ГОСТу",
      "Базовые инструменты",
      "Без регистрации",
    ],
    accent: false,
  },
  {
    id: "one_time" as const,
    name: "Разовая",
    price: "159 ₽",
    period: "за 1 документ",
    icon: Zap,
    description: "Обработка одного документа",
    features: [
      "1 обработка документа",
      "Без ограничения по страницам",
      "AI-анализ структуры",
      "Форматирование по ГОСТу",
      "Базовые инструменты",
      "Скачивание результата",
    ],
    accent: false,
  },
  {
    id: "subscription" as const,
    name: "Pro",
    price: "399 ₽",
    period: "/ месяц",
    icon: Crown,
    description: "10 обработок в месяц",
    features: [
      "10 обработок в месяц",
      "Без ограничения по страницам",
      "Все инструменты без ограничений",
      "Форматирование по ГОСТу",
      "Грамматика, рерайт, подбор литературы",
      "Скачивание результатов",
      "Приоритетная обработка",
    ],
    accent: true,
  },
];

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  // Если есть параметр unlock — пользователь пришёл разблокировать полную версию документа
  const unlockJobId = searchParams.get("unlock");

  const handlePurchase = async (offerType: "trial" | "one_time" | "subscription") => {
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            Тарифы
          </div>
        }
        title="Выберите подходящий тариф"
        subtitle="Форматирование, проверка грамматики, подбор литературы и другие AI-инструменты для вашей работы"
      />

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Баннер разблокировки полной версии */}
        {unlockJobId && (
          <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-violet-500/20 to-indigo-500/20 border border-violet-500/30">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                <FileCheck className="w-6 h-6 text-white" />
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

        {/* Тарифные карточки */}
        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.id}
                className={`relative transition-all ${
                  plan.accent
                    ? "bg-violet-500/10 border-violet-500/30 shadow-xl shadow-violet-500/20 scale-105 z-10"
                    : "bg-surface border-surface-border opacity-[0.9]"
                }`}
              >
                {plan.accent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-xs font-semibold z-10">
                    Популярное
                  </span>
                )}

                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        plan.accent
                          ? "bg-violet-500/20 text-violet-400"
                          : "bg-surface-hover text-on-surface-muted"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-foreground text-lg">{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Цена */}
                  <div>
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-on-surface-subtle ml-1">{plan.period}</span>
                  </div>

                  {/* Фичи */}
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm text-on-surface">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* Кнопка */}
                  <Button
                    className="w-full"
                    variant={plan.accent ? "glow" : "outline"}
                    onClick={() => handlePurchase(plan.id)}
                    disabled={loading !== null}
                  >
                    {loading === plan.id
                      ? "Перенаправление..."
                      : plan.id === "trial"
                        ? "Попробовать бесплатно"
                        : plan.accent
                          ? "Оформить подписку"
                          : "Купить"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Подсказка */}
        <div className="text-center mt-8">
          <p className="text-muted-foreground text-sm">
            Без регистрации карты · Отмена подписки в любой момент
          </p>
        </div>

        {/* FAQ секция */}
        <div className="mt-16 pt-12 border-t border-surface-border">
          <div className="flex items-center justify-center gap-2 mb-8">
            <HelpCircle className="w-5 h-5 text-violet-400" />
            <h2 className="text-xl font-semibold text-foreground">Частые вопросы об оплате</h2>
          </div>

          <div className="grid gap-6 max-w-2xl mx-auto">
            <div className="bg-surface rounded-xl p-6 border border-surface-border">
              <h3 className="font-medium text-foreground mb-2">Какие способы оплаты доступны?</h3>
              <p className="text-on-surface-muted text-sm">
                Принимаем банковские карты (Visa, MasterCard, МИР), а также оплату через СБП и электронные кошельки.
              </p>
            </div>

            <div className="bg-surface rounded-xl p-6 border border-surface-border">
              <h3 className="font-medium text-foreground mb-2">Как работает пробный период?</h3>
              <p className="text-on-surface-muted text-sm">
                Первый документ обрабатывается бесплатно без привязки карты. Вы сможете оценить качество форматирования перед покупкой.
              </p>
            </div>

            <div className="bg-surface rounded-xl p-6 border border-surface-border">
              <h3 className="font-medium text-foreground mb-2">Можно ли отменить подписку?</h3>
              <p className="text-on-surface-muted text-sm">
                Да, подписку можно отменить в любой момент. Доступ сохранится до конца оплаченного периода.
              </p>
            </div>
          </div>

          <div className="text-center mt-8">
            <Link
              href="/faq"
              className="text-primary hover:text-primary/80 text-sm transition-colors"
            >
              Все вопросы и ответы →
            </Link>
          </div>
        </div>
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
