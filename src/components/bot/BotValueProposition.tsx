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
      "Форматирование, грамматика, перефразирование, план, литература, хранилище заметок. Не нужно ничего больше. Один чат — и вся учёба.",
    delay: 0.3,
  },
  {
    icon: Clock,
    title: "Меньше хаоса перед дедлайном",
    description:
      "Заметки уже собраны, цитаты на месте, конспекты структурированы. Не нужно перерывать 5 мессенджеров и 3 папки — всё в одном чате.",
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
              Чем больше материалов ты добавляешь — тем полезнее становится бот.
              <br />
              <span className="text-foreground font-medium">
                Через месяц у тебя персональная база знаний, которая работает 24/7.
              </span>
            </p>
          </div>
        </BlurFade>
        <BlurFade delay={0.6} inView>
          <p className="text-center text-sm text-muted-foreground max-w-lg mx-auto italic">
            Знания копятся каждый день. Через месяц у тебя будет
            персональная библиотека — и к экзамену не нужно перечитывать всё заново.
          </p>
        </BlurFade>
      </div>
    </section>
  );
}
