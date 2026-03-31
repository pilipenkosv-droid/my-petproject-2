import { BlurFade } from "@/components/ui/blur-fade";
import { GraduationCap, BookOpen, Mic } from "lucide-react";

const useCases = [
  {
    icon: GraduationCap,
    trigger: "Экзамен через 2 дня",
    story:
      "За семестр ты скидывал в бота конспекты после каждой лекции — голосовыми и текстом. Перед экзаменом пишешь: /ask Что я учил про операционализацию понятий? Бот выдаёт твои же записи — структурированно.",
    outcome: "Вся подготовка — из своих же записей, структурированно и по теме.",
    delay: 0.2,
  },
  {
    icon: BookOpen,
    trigger: "Пишешь курсовую",
    story:
      "Каждый раз, когда читаешь статью, пересылаешь важную цитату в бота. Перед написанием главы: /ask Что у меня есть про контент-анализ? Бот собирает всё, что ты сохранял.",
    outcome: "Написал теоретическую главу за вечер — все цитаты и источники уже были собраны.",
    delay: 0.3,
  },
  {
    icon: Mic,
    trigger: "После пар, в метро",
    story:
      'Устал после лекции, но запомнил важное. Надиктовываешь 30 секунд голосового: "Эффект фрейминга — как контекст влияет на решения." Через неделю перед семинаром: /ask фрейминг — бот выдаёт твои же слова.',
    outcome: "40 минут дороги × 5 дней = 3 часа мыслей в неделю, которые раньше терялись.",
    delay: 0.4,
  },
];

export function BotUseCases() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Узнаёшь себя?
          </h2>
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <p className="text-center text-on-surface-subtle mb-16 max-w-xl mx-auto">
            Три ситуации, в которых бот уже спас чей-то семестр
          </p>
        </BlurFade>

        <div className="grid md:grid-cols-3 gap-6">
          {useCases.map((uc) => {
            const Icon = uc.icon;
            return (
              <BlurFade key={uc.trigger} delay={uc.delay} inView>
                <div className="bg-surface border border-surface-border p-6 h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-600 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-semibold text-foreground">{uc.trigger}</h3>
                  </div>
                  <p className="text-sm text-on-surface-muted leading-relaxed flex-1 mb-4">
                    {uc.story}
                  </p>
                  <p className="text-sm font-medium text-emerald-500">
                    {uc.outcome}
                  </p>
                </div>
              </BlurFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}
