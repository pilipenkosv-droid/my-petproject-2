import { BlurFade } from "@/components/ui/blur-fade";
import { Coffee, Layers, Clock } from "lucide-react";

const anchors = [
  {
    icon: Coffee,
    title: "Дешевле похода в кофейню",
    description: "399 ₽ = 2 чашки кофе. Зато AI-напарник работает на тебя весь месяц, 24/7.",
    delay: 0.2,
  },
  {
    icon: Layers,
    title: "6 инструментов в одной подписке",
    description:
      "Форматирование, грамматика, рерайт, план работы, поиск литературы, хранилище заметок. Всё включено.",
    delay: 0.3,
  },
  {
    icon: Clock,
    title: "Экономит 8 часов в месяц",
    description:
      "Студент тратит ~1 час в неделю на поиск своих же записей. Бот находит за секунды. Твоё время стоит дороже.",
    delay: 0.4,
  },
];

export function BotValueProposition() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            399 ₽ — это не расход. Это инвестиция в свой семестр.
          </h2>
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <p className="text-center text-on-surface-subtle mb-16 max-w-xl mx-auto">
            Меньше 13 ₽ в день за напарника, который не забывает ничего
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
              Для сравнения: один час репетитора — от 1 500 ₽. Одна страница редактуры — от 500 ₽.
              <br />
              <span className="text-foreground font-medium">
                AI-напарник за 399 ₽/мес помогает каждый день.
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
