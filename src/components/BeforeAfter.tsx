"use client";

import { BlurFade } from "@/components/ui/blur-fade";

const beforeErrors = [
  "Шрифт Arial, 12 pt",
  "Одинарный интервал",
  "Поля: 10-10-10-10 мм",
  "Без абзацного отступа",
  "Заголовки не выделены",
  "Нумерация с 1 стр.",
];

const afterFixes = [
  "Times New Roman, 14 pt",
  "Полуторный интервал",
  "Поля: 20-30-15-15 мм",
  "Отступ 1.25 см",
  "Заголовки по ГОСТу",
  "Нумерация с 3 стр.",
];

export function BeforeAfter() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Результат за 3 минуты
          </h2>
          <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
            Посмотрите, как AI исправляет типичные ошибки форматирования
          </p>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <div className="border border-border">
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {/* Before */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-muted-foreground">До обработки</span>
                </div>
                <div className="divide-y divide-border">
                  {beforeErrors.map((text, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-3"
                    >
                      <span className="text-red-400 text-xs font-mono shrink-0">✕</span>
                      <span className="text-sm text-muted-foreground line-through decoration-red-400/40">{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* After */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-muted-foreground">После обработки</span>
                </div>
                <div className="divide-y divide-border">
                  {afterFixes.map((text, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-3"
                    >
                      <span className="text-emerald-500 text-xs font-mono shrink-0">✓</span>
                      <span className="text-sm text-foreground">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
