import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";
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
import { AlphaSpotsCounter } from "@/components/bot/AlphaSpotsCounter";
import { Zap, FileCheck } from "lucide-react";
import { generatePageMetadata } from "@/lib/seo/metadata";

export const metadata = generatePageMetadata({
  title: "ИИ-бот для учёбы в Telegram — конспекты, поиск, инструменты | Diplox",
  description:
    "ИИ-бот для студентов в Telegram — сохраняй лекции голосом, ищи по своим заметкам, используй все инструменты Diplox в одном чате. Входит в тариф Pro Plus.",
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
});

export default function SecondBrainPage() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Header />

      {/* Связь с Diplox */}
      <div className="bg-muted border-b border-border px-4 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-center gap-3 text-sm">
          <FileCheck className="w-4 h-4 text-foreground shrink-0" />
          <span className="text-on-surface-muted">
            ИИ-бот для студентов в Telegram — <span className="text-foreground font-medium">помогает писать, не только хранить</span>
          </span>
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

      {/* Final CTA */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-3xl">
          <div className="bg-surface border border-surface-border p-12">
            <BlurFade delay={0.1} inView>
              <div className="text-center">
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Попробуй Diplox Bot бесплатно
                </h2>
                <p className="text-on-surface-muted mb-6 max-w-md mx-auto">
                  7 дней полного доступа — без оплаты. Начни копить знания уже сегодня.
                </p>
                <div className="flex justify-center mb-4">
                  <AlphaSpotsCounter />
                </div>
                <div className="flex flex-col items-center gap-3">
                  <Button size="lg" className="text-base sm:text-lg px-8" asChild>
                    <Link href="/pricing?plan=subscription_plus&ref=second-brain">
                      <Zap className="w-5 h-5 mr-2 shrink-0" />
                      Попробовать 7 дней бесплатно
                    </Link>
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Затем 1 499 ₽/мес · Отмена в любой момент
                  </p>
                </div>
              </div>
            </BlurFade>
          </div>
        </div>
      </section>
    </main>
  );
}
