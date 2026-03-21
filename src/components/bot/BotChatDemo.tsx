import { BlurFade } from "@/components/ui/blur-fade";
import { Bot, Mic, Check } from "lucide-react";

export function BotChatDemo() {
  return (
    <section className="relative py-24 px-6 bg-muted/30">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Вот как это выглядит
          </h2>
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
            Реальный диалог с ботом в Telegram
          </p>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <div className="mx-auto max-w-sm">
            {/* Phone frame */}
            <div className="bg-surface border border-surface-border rounded-2xl shadow-lg overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface">
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">AI-напарник</p>
                  <p className="text-xs text-emerald-500">онлайн</p>
                </div>
              </div>

              {/* Chat messages */}
              <div className="p-4 space-y-4 min-h-[380px]">
                {/* User message 1 — voice */}
                <div className="flex justify-end">
                  <div className="bg-purple-600 text-white px-4 py-2 rounded-2xl rounded-br-sm max-w-[75%]">
                    <div className="flex items-center gap-2 text-sm">
                      <Mic className="w-3.5 h-3.5" />
                      <span>Голосовое · 0:23</span>
                    </div>
                  </div>
                </div>

                {/* Bot reply 1 */}
                <div className="flex justify-start">
                  <div className="bg-muted border border-border px-4 py-3 rounded-2xl rounded-bl-sm max-w-[85%]">
                    <p className="text-xs text-purple-400 font-medium mb-1">AI-напарник</p>
                    <p className="text-sm text-foreground">
                      Сохранено в хранилище <Check className="w-3.5 h-3.5 text-emerald-500 inline" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Распознано: &quot;Эффект фрейминга — контекст подачи информации влияет на принятие решений...&quot;
                    </p>
                  </div>
                </div>

                {/* User message 2 — /ask */}
                <div className="flex justify-end">
                  <div className="bg-purple-600 text-white px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[85%]">
                    <p className="text-sm font-mono">/ask что я записывал про фрейминг?</p>
                  </div>
                </div>

                {/* Bot reply 2 — structured answer */}
                <div className="flex justify-start">
                  <div className="bg-muted border border-border px-4 py-3 rounded-2xl rounded-bl-sm max-w-[85%]">
                    <p className="text-xs text-purple-400 font-medium mb-2">AI-напарник</p>
                    <p className="text-sm text-foreground mb-2">
                      По твоим заметкам от 14 марта:
                    </p>
                    <div className="text-sm text-on-surface-muted space-y-1">
                      <p>— Эффект фрейминга: контекст подачи влияет на решения</p>
                      <p>— Пример: &quot;90% выживаемость&quot; vs &quot;10% смертность&quot;</p>
                      <p>— Каннеман и Тверски, 1981</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Источник: 1 голосовая заметка
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
