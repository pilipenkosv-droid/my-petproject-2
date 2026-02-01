"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, Crown } from "lucide-react";

const plans = [
  {
    id: "one_time" as const,
    name: "Разовая",
    price: "159 ₽",
    period: "за 1 документ",
    icon: Zap,
    description: "Обработка одного документа",
    features: [
      "1 обработка документа",
      "AI-анализ структуры",
      "Форматирование по ГОСТу",
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
    description: "Безлимитные обработки",
    features: [
      "Безлимитные обработки",
      "AI-анализ структуры",
      "Форматирование по ГОСТу",
      "Скачивание результатов",
      "Приоритетная обработка",
    ],
    accent: true,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (offerType: "one_time" | "subscription") => {
    if (!user) {
      router.push("/login?redirect=/pricing");
      return;
    }

    setLoading(offerType);

    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerType }),
      });

      const data = await res.json();

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
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

      <main className="mx-auto max-w-4xl px-6 py-16">
        {/* Заголовок */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            Тарифы
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Выберите подходящий тариф
          </h1>
          <p className="text-white/60 text-lg max-w-xl mx-auto">
            Автоматическое форматирование научных работ по требованиям вашего ВУЗа
          </p>
        </div>

        {/* Тарифные карточки */}
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden transition-all ${
                  plan.accent
                    ? "bg-violet-500/10 border-violet-500/30 shadow-lg shadow-violet-500/10"
                    : "bg-white/5 border-white/10"
                }`}
              >
                {plan.accent && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
                )}

                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        plan.accent
                          ? "bg-violet-500/20 text-violet-400"
                          : "bg-white/10 text-white/60"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-white text-lg">{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Цена */}
                  <div>
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-white/50 ml-1">{plan.period}</span>
                  </div>

                  {/* Фичи */}
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm text-white/80">
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
                      : plan.accent
                        ? "Оформить подписку"
                        : "Купить"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Бесплатный триал */}
        <div className="text-center mt-8">
          <p className="text-white/40 text-sm">
            Первая обработка документа — бесплатно, без регистрации карты
          </p>
        </div>
      </main>
    </div>
  );
}
