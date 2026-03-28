import { BlurFade } from "@/components/ui/blur-fade";
import { Brain, FolderOpen, Clock } from "lucide-react";

const identities = [
  {
    icon: Brain,
    text: "...ты выходишь с лекции с ощущением, что понял всё, а через неделю помнишь ноль",
    delay: 0.2,
  },
  {
    icon: FolderOpen,
    text: "...твои заметки разбросаны по телефону, личке и тетрадке — и ни в одном месте нельзя найти нужное",
    delay: 0.3,
  },
  {
    icon: Clock,
    text: "...ты пишешь курсовую и 3 часа из 6 уходят не на текст, а на поиск того, что уже читал",
    delay: 0.4,
  },
];

export function BotIdentitySection() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-16">
            Это для тебя, если...
          </h2>
        </BlurFade>

        <div className="grid md:grid-cols-3 gap-4">
          {identities.map((item) => {
            const Icon = item.icon;
            return (
              <BlurFade key={item.text} delay={item.delay} inView>
                <div className="bg-surface border border-surface-border p-6 h-full text-center">
                  <div className="w-12 h-12 bg-foreground flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-background" />
                  </div>
                  <p className="text-sm text-on-surface-muted leading-relaxed">
                    {item.text}
                  </p>
                </div>
              </BlurFade>
            );
          })}
        </div>

        <BlurFade delay={0.5} inView>
          <p className="text-center text-xs text-muted-foreground mt-8 max-w-md mx-auto">
            Это НЕ для тебя, если ты уже успел всё систематизировать и никогда
            ничего не теряешь.{" "}
            <span className="italic">(Мы таких не знаем.)</span>
          </p>
        </BlurFade>
      </div>
    </section>
  );
}
