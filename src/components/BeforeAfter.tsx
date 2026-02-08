"use client";

import { BlurFade } from "@/components/ui/blur-fade";

const beforeErrors = [
  { text: "Шрифт Arial, 12 pt", error: true },
  { text: "Одинарный интервал", error: true },
  { text: "Поля: 10-10-10-10 мм", error: true },
  { text: "Без абзацного отступа", error: true },
  { text: "Заголовки не выделены", error: true },
  { text: "Нумерация с 1 стр.", error: true },
];

const afterFixes = [
  { text: "Times New Roman, 14 pt", fixed: true },
  { text: "Полуторный интервал", fixed: true },
  { text: "Поля: 20-30-15-15 мм", fixed: true },
  { text: "Отступ 1.25 см", fixed: true },
  { text: "Заголовки по ГОСТу", fixed: true },
  { text: "Нумерация с 3 стр.", fixed: true },
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
          <div className="grid md:grid-cols-2 gap-6">
            {/* Before */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm font-medium text-red-400">До обработки</span>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-surface p-6 space-y-3">
                {beforeErrors.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10"
                  >
                    <span className="text-red-400 text-xs font-mono">✕</span>
                    <span className="text-sm text-on-surface-muted line-through decoration-red-400/50">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* After */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-emerald-400">После обработки</span>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-surface p-6 space-y-3">
                {afterFixes.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10"
                  >
                    <span className="text-emerald-400 text-xs font-mono">✓</span>
                    <span className="text-sm text-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
