import Link from "next/link";
import { Header } from "@/components/Header";

import { BotHero } from "@/components/bot/BotHero";
import { BotTextRibbon } from "@/components/bot/BotTextRibbon";
import { BotIdentitySection } from "@/components/bot/BotIdentitySection";
import { BotFeatures } from "@/components/bot/BotFeatures";
import { BotUseCases } from "@/components/bot/BotUseCases";
import { BotChatDemo } from "@/components/bot/BotChatDemo";
import { BotBeforeAfter } from "@/components/bot/BotBeforeAfter";
import { BotTestimonials } from "@/components/bot/BotTestimonials";
import { BotValueProposition } from "@/components/bot/BotValueProposition";
import { BotHowItWorks } from "@/components/bot/BotHowItWorks";
import { BotFaq } from "@/components/bot/BotFaq";
import { AlertTriangle } from "lucide-react";
import { generatePageMetadata } from "@/lib/seo/metadata";

export const metadata = {
  ...generatePageMetadata({
    title: "ИИ-бот для учёбы в Telegram — конспекты, поиск, инструменты | Diplox",
    description:
      "Diplox Bot в Telegram: сохранение лекций голосом, поиск по своим заметкам, инструменты Diplox в одном чате. Сервис сейчас не работает.",
    path: "/second-brain",
    keywords: [
      "нейросеть для решения задач",
      "нейросеть для студентов",
      "нейросеть для студентов бесплатно",
      "нейросеть для учёбы",
      "бот для учёбы telegram",
      "персональная база знаний",
      "ии бот для студентов",
      "diplox bot",
      "нейросеть для студентов telegram",
    ],
  }),
  // Сервис отключён: страницу не индексируем, но ссылки из блога остаются рабочими.
  robots: { index: false, follow: true },
};

export default function SecondBrainPage() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Header />

      {/* Сервис отключён */}
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-4">
        <div className="mx-auto max-w-3xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-foreground font-semibold">
              Данный сервис в данный момент не работает
            </p>
            <p className="text-on-surface-muted mt-1">
              Инструменты форматирования по ГОСТу и методичке работают как обычно —{" "}
              <Link href="/create" className="text-primary font-medium hover:underline">
                перейти к обработке документа
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Воронка по Годину: идентичность → трансформация → соц.доказательство → механизм → цена → разрешение */}
      <BotHero />
      <BotTextRibbon />
      <BotIdentitySection />
      <BotFeatures />
      <BotUseCases />
      <BotChatDemo />
      <BotBeforeAfter />
      <BotTestimonials />
      <BotValueProposition />
      <BotHowItWorks />
      <BotFaq />

    </main>
  );
}
