import { BlurFade } from "@/components/ui/blur-fade";

const beforeItems = [
  "Заметки разбросаны по телефону, Notion и бумаге",
  "Перед экзаменом — паника и перечитывание всего",
  "Забыл мысль с лекции — потеряна навсегда",
  "Смотрел на пустой экран 2 часа. Ни одного предложения.",
  "Переключаешься между вкладками для плана работы",
  "Собираешь источники вручную 1-2 часа",
];

const afterItems = [
  "Всё в одном чате — поиск 5 секунд вместо 30 минут",
  "/ask — бот выдаёт нужное из твоих же записей",
  "Голосовое сохраняется автоматически — ни одна мысль не теряется",
  "За 20 минут накидал план. Бот ответил на 3 вопроса по теме. Сел и поехал.",
  "/outline — структура курсовой за минуту вместо вечера",
  "/sources — 10 источников за 30 секунд вместо 2 часов",
];

export function BotBeforeAfter() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Как изменится твоя учёба
          </h2>
          <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
            Один чат вместо пяти разных инструментов
          </p>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <div className="border border-border">
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {/* Before */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-muted-foreground">Без бота</span>
                </div>
                <div className="divide-y divide-border">
                  {beforeItems.map((text, i) => (
                    <div key={i} className="flex items-center gap-3 py-3">
                      <span className="text-red-400 text-xs font-mono shrink-0">✕</span>
                      <span className="text-sm text-muted-foreground">{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* After */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-muted-foreground">С ботом</span>
                </div>
                <div className="divide-y divide-border">
                  {afterItems.map((text, i) => (
                    <div key={i} className="flex items-center gap-3 py-3">
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
