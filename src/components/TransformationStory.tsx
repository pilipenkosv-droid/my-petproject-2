import { BlurFade } from "@/components/ui/blur-fade";

export function TransformationStory() {
  return (
    <section className="relative py-24 px-6">
      <div className="relative mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Ты узнаёшь эту ночь
          </h2>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
            Один и тот же диплом. Два разных способа.
          </p>
        </BlurFade>

        <div className="border border-border">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Before */}
            <BlurFade delay={0.3} inView>
              <div className="p-8">
                <span className="text-xs font-mono text-red-400 uppercase tracking-widest mb-4 block">
                  Без Diplox
                </span>
                <p className="text-on-surface-muted leading-relaxed text-sm">
                  Сдача послезавтра. Текст готов. Открываю методичку: поля
                  30-15-20-20, Times New Roman 14, интервал 1,5... Начинаю
                  вручную. Час прошёл — а я только на третьей странице.
                  Преподаватель говорит: «Переделай оформление.» Ещё день
                  потерян.
                </p>
                <p className="text-xs text-muted-foreground mt-4 italic">
                  — Настя, ВШЭ, 3 курс
                </p>
              </div>
            </BlurFade>

            {/* After */}
            <BlurFade delay={0.4} inView>
              <div className="p-8">
                <span className="text-xs font-mono text-emerald-500 uppercase tracking-widest mb-4 block">
                  С Diplox
                </span>
                <p className="text-on-surface-muted leading-relaxed text-sm">
                  Загрузила методичку и документ. Через 3 минуты скачала готовый
                  файл. Нормоконтроль — без единого замечания. Однокурсники всё
                  ещё правят отступы вручную.
                </p>
                <p className="text-xs text-muted-foreground mt-4 italic">
                  — Настя, ВШЭ, 3 курс — тот же диплом, другой способ
                </p>
              </div>
            </BlurFade>
          </div>
        </div>
      </div>
    </section>
  );
}
