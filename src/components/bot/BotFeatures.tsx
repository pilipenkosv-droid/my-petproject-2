import { BlurFade } from "@/components/ui/blur-fade";
import { Archive, MessageCircleQuestion, Wrench, BookOpen } from "lucide-react";

const features = [
  {
    icon: Archive,
    title: "Одно место для всего",
    description:
      "Голосовые, текст, PDF, DOCX — всё в одном чате. Через месяц твой архив станет умнее тебя.",
    delay: 0.2,
  },
  {
    icon: MessageCircleQuestion,
    title: "Спрашивай у прошлого себя",
    description:
      '/ask «Что я учил про выборку?» — бот находит твои же слова. Больше не нужно держать всё в голове — спрашивай, когда нужно.',
    delay: 0.25,
  },
  {
    icon: Wrench,
    title: "Всё — не выходя из Telegram",
    description:
      "План, грамматика, перефразирование — прямо в чате, где ты и так проводишь 2 часа в день. Без регистраций, без переключений.",
    delay: 0.3,
  },
  {
    icon: BookOpen,
    title: "Конспект, который пишется сам",
    description:
      "/process вечером — хаос дня превращается в структурированный конспект. 30 секунд вместо 40 минут ручного разбора.",
    delay: 0.35,
  },
];

export function BotFeatures() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Меньше хаоса. Больше знаний.
          </h2>
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <p className="text-center text-on-surface-subtle mb-16 max-w-xl mx-auto">
            Четыре привычки, которые изменят твою учёбу за один семестр
          </p>
        </BlurFade>

        <div className="grid sm:grid-cols-2 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <BlurFade key={feature.title} delay={feature.delay} inView>
                <div className="flex items-start gap-4 bg-surface border border-surface-border p-6 h-full">
                  <div className="w-11 h-11 bg-foreground flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-background" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                    <p className="text-sm text-on-surface-muted leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </BlurFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}
