import { BlurFade } from "@/components/ui/blur-fade";
import { Archive, MessageCircleQuestion, Wrench, BookOpen } from "lucide-react";

const features = [
  {
    icon: Archive,
    title: "Хранилище заметок",
    description: "Отправляй текст, голосовые сообщения, PDF и DOCX — бот сохраняет всё в личный архив.",
    delay: 0.2,
  },
  {
    icon: MessageCircleQuestion,
    title: "AI-ответы из заметок",
    description: "/ask «Что я учил про методологию?» — бот ответит, используя только твои записи.",
    delay: 0.25,
  },
  {
    icon: Wrench,
    title: "Инструменты в чате",
    description: "План работы, проверка грамматики, рерайт, аннотация, поиск литературы — без перехода на сайт.",
    delay: 0.3,
  },
  {
    icon: BookOpen,
    title: "Дневной конспект",
    description: "/process — структурированный конспект дня: ключевые идеи, открытые вопросы, что повторить.",
    delay: 0.35,
  },
];

export function BotFeatures() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Всё для учёбы — в одном боте
          </h2>
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <p className="text-center text-on-surface-subtle mb-16 max-w-xl mx-auto">
            AI-напарник помогает накапливать знания и использовать их тогда, когда нужно
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
