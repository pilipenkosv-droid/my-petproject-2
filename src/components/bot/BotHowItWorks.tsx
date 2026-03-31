import { BlurFade } from "@/components/ui/blur-fade";
import { CreditCard, Send, MessageCircle, Wrench } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: CreditCard,
    title: "Купи Pro Plus",
    description: "Оформи подписку за 1 499 ₽/мес — ссылка на бота придёт автоматически после оплаты.",
    delay: 0.3,
  },
  {
    step: "02",
    icon: Send,
    title: "Отправляй заметки",
    description: "Пиши текст, записывай голосовые сообщения, пересылай PDF и DOCX — бот всё сохранит.",
    delay: 0.4,
  },
  {
    step: "03",
    icon: MessageCircle,
    title: "Задавай вопросы",
    description: "/ask «Объясни мне про регрессионный анализ» — бот ответит из твоего личного архива.",
    delay: 0.5,
  },
  {
    step: "04",
    icon: Wrench,
    title: "Используй инструменты",
    description: "Генерация плана, проверка грамматики, перефразирование, аннотация, дневной конспект — всё в Telegram.",
    delay: 0.6,
  },
];

export function BotHowItWorks() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Как это работает
          </h2>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <p className="text-center text-on-surface-subtle mb-16 max-w-xl mx-auto">
            От покупки до первого ответа бота — 2 минуты
          </p>
        </BlurFade>

        <div className="border border-border">
          <div className="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {steps.map((item) => {
              const Icon = item.icon;
              return (
                <BlurFade key={item.step} delay={item.delay} inView className="flex-1">
                  <div className="p-6 h-full">
                    <span className="text-xs font-mono text-muted-foreground mb-4 block">{item.step}</span>
                    <Icon className="w-5 h-5 text-foreground mb-3" />
                    <h3 className="text-sm font-semibold text-foreground mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </BlurFade>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
