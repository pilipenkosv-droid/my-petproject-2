import { BlurFade } from "@/components/ui/blur-fade";
import { ShieldAlert, Layers, Clock } from "lucide-react";

const anchors = [
  {
    icon: ShieldAlert,
    title: "Дешевле одной пересдачи",
    description: "Пересдача — это потерянный месяц, нервы и повторная подготовка. 1 499 ₽ — чтобы этого не было.",
    delay: 0.2,
  },
  {
    icon: Layers,
    title: "Один чат заменяет 6 сервисов",
    description:
      "Форматирование, грамматика, рерайт, план, литература, хранилище заметок. Не нужно ничего больше. Один чат — и вся учёба.",
    delay: 0.3,
  },
  {
    icon: Clock,
    title: "Возвращает 20+ часов в месяц",
    description:
      "Поиск заметок, повторное чтение, ручные конспекты, разбор хаоса перед дедлайном — всё это время теперь твоё. 20 часов — это 2,5 рабочих дня.",
    delay: 0.4,
  },
];

export function BotValueProposition() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            1 499 ₽ — это не расход. Это инвестиция в свой семестр.
          </h2>
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <p className="text-center text-on-surface-subtle mb-16 max-w-xl mx-auto">
            Меньше 50 ₽ в день за напарника, который не забывает ничего
          </p>
        </BlurFade>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {anchors.map((anchor) => {
            const Icon = anchor.icon;
            return (
              <BlurFade key={anchor.title} delay={anchor.delay} inView>
                <div className="bg-surface border border-surface-border p-6 h-full text-center">
                  <div className="w-12 h-12 bg-purple-600 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{anchor.title}</h3>
                  <p className="text-sm text-on-surface-muted leading-relaxed">{anchor.description}</p>
                </div>
              </BlurFade>
            );
          })}
        </div>

        <BlurFade delay={0.5} inView>
          <div className="text-center bg-purple-500/5 border border-purple-500/20 p-6 mb-4">
            <p className="text-on-surface-muted text-sm">
              Для сравнения: репетитор за 1 500 ₽/час помогает один раз. Редактура — от 500 ₽/стр.
              <br />
              <span className="text-foreground font-medium">
                Второй мозг за 1 499 ₽/мес работает каждый день, 24/7 — и становится полезнее с каждой неделей.
              </span>
            </p>
          </div>
        </BlurFade>
        <BlurFade delay={0.6} inView>
          <p className="text-center text-sm text-muted-foreground max-w-lg mx-auto italic">
            Студенты, которые платят за свои инструменты, — сдают иначе.
            Не потому что инструмент магический. Потому что они решили:
            «Я берусь за это всерьёз.»
          </p>
        </BlurFade>
      </div>
    </section>
  );
}
