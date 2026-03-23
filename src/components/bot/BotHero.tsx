"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { AlphaSpotsCounter } from "@/components/bot/AlphaSpotsCounter";
import { Bot, Zap } from "lucide-react";

export function BotHero() {
  return (
    <section className="relative flex items-center justify-center px-4 sm:px-6 py-16 sm:py-24">
      <div className="relative z-10 mx-auto max-w-3xl w-full text-center">
        {/* Alpha badge — объединённый баннер с счётчиком мест */}
        <BlurFade delay={0.1} inView>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted border border-border text-sm mb-6">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-foreground font-medium">Закрытый альфа-тест</span>
            <span className="text-on-surface-muted">·</span>
            <AlphaSpotsCounter variant="inline" />
          </div>
        </BlurFade>

        {/* H1 */}
        <BlurFade delay={0.2} inView>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Перестань терять<br />
            <span className="text-primary">то, что уже знаешь.</span>
          </h1>
        </BlurFade>

        {/* Subtitle */}
        <BlurFade delay={0.3} inView>
          <p className="text-lg text-on-surface-subtle max-w-xl mx-auto mb-8 leading-relaxed">
            Ты учишься каждый день. Но половина знаний теряется к следующей неделе.
            AI-напарник в Telegram сохраняет всё — и находит за секунду, когда нужно.
          </p>
        </BlurFade>

        {/* CTA */}
        <BlurFade delay={0.4} inView>
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
            После покупки ты автоматически получишь ссылку на бота
          </p>
        </BlurFade>
      </div>
    </section>
  );
}
