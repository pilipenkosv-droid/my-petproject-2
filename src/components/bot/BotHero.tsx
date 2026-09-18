"use client";

import { BlurFade } from "@/components/ui/blur-fade";

export function BotHero() {
  return (
    <section className="relative flex items-center justify-center px-4 sm:px-6 py-16 sm:py-24">
      <div className="relative z-10 mx-auto max-w-3xl w-full text-center">
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
            Ты учишь 5 дней в неделю. К экзамену — хаос в заметках.
            Diplox Bot хранит всё, что ты отправишь — и выдаёт нужное за секунду.
          </p>
        </BlurFade>

      </div>
    </section>
  );
}
