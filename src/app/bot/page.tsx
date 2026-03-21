import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { Header } from "@/components/Header";
import { GrainOverlay } from "@/components/GrainOverlay";
import { BotHero } from "@/components/bot/BotHero";
import { BotFeatures } from "@/components/bot/BotFeatures";
import { BotUseCases } from "@/components/bot/BotUseCases";
import { BotChatDemo } from "@/components/bot/BotChatDemo";
import { BotBeforeAfter } from "@/components/bot/BotBeforeAfter";
import { BotTestimonials } from "@/components/bot/BotTestimonials";
import { BotValueProposition } from "@/components/bot/BotValueProposition";
import { BotHowItWorks } from "@/components/bot/BotHowItWorks";
import { BotFaq } from "@/components/bot/BotFaq";
import { AlphaSpotsCounter } from "@/components/bot/AlphaSpotsCounter";
import { Zap } from "lucide-react";
import { generatePageMetadata } from "@/lib/seo/metadata";

export const metadata = generatePageMetadata({
  title: "AI-напарник для студентов в Telegram",
  description:
    "Telegram-бот для студентов: хранилище заметок, AI-ответы из твоих материалов, план работы, грамматика, рерайт — всё в чате. Закрытый альфа-тест, 10 мест.",
  path: "/bot",
  keywords: [
    "telegram бот для студентов",
    "AI помощник студентам",
    "бот для учёбы",
    "нейросеть для студентов telegram",
  ],
});

export default function BotPage() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <GrainOverlay />
      <Header />

      <BotHero />
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
                  Войди в закрытый альфа-тест
                </h2>
                <p className="text-on-surface-muted mb-6 max-w-md mx-auto">
                  Первые 10 студентов получают полный доступ к AI-напарнику при покупке Pro-подписки
                </p>
                <div className="flex justify-center mb-8">
                  <AlphaSpotsCounter />
                </div>
                <div className="relative inline-flex overflow-hidden rounded-lg">
                  <Button size="lg" className="text-base sm:text-lg px-8" asChild>
                    <Link href="/pricing?plan=subscription&ref=bot">
                      <Zap className="w-5 h-5 mr-2 shrink-0" />
                      Получить доступ — 399 ₽/мес
                    </Link>
                  </Button>
                  <BorderBeam size={80} duration={5} colorFrom="#a855f7" colorTo="#6366f1" borderWidth={2} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  После покупки ты автоматически получишь ссылку на бота в Telegram
                </p>
              </div>
            </BlurFade>
          </div>
        </div>
      </section>
    </main>
  );
}
