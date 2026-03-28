import { Star } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";

const testimonials = [
  {
    name: "Катя М.",
    university: "РГГУ",
    workType: "3 курс · социология",
    rating: 5,
    text: "Готовилась к зачёту по качественным методам — за семестр накопила 40 голосовых заметок. Написала /ask выборка в качественных исследованиях и бот выдал мои же конспекты. Сдала на отлично, ничего не перечитывая.",
  },
  {
    name: "Артём В.",
    university: "НИУ ВШЭ",
    workType: "4 курс · политология",
    rating: 5,
    text: "Пишу диплом — каждую статью пересылаю цитатой в бота. Когда нужно писать главу, спрашиваю /ask что у меня есть про дискурс-анализ. Больше не теряю источники и цитаты.",
  },
  {
    name: "Настя Л.",
    university: "СПбГУ",
    workType: "Магистратура · история",
    rating: 5,
    text: "Я очень устаю после пар и раньше ничего не конспектировала. Теперь надиктовываю голосовое в Telegram — 30 секунд после лекции. /process вечером — и у меня полный конспект дня.",
  },
  {
    name: "Игорь Т.",
    university: "МПГУ",
    workType: "2 курс · психология",
    rating: 4,
    text: "Удобно, что всё в Telegram — не нужно заходить на сайт. Написал тему курсовой в /plan — получил структуру за минуту. Пришлось немного подправить, но основа была готова.",
  },
];

export function BotTestimonials() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Что говорят альфа-тестеры
          </h2>
          <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
            Студенты, которые перестали терять знания
          </p>
        </BlurFade>

        <div className="grid gap-6 md:grid-cols-2">
          {testimonials.map((t, i) => (
            <BlurFade key={i} delay={0.2 + i * 0.1} inView>
              <div className="bg-surface border border-surface-border p-6 h-full flex flex-col">
                {/* Rating */}
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, starIdx) => (
                    <Star
                      key={starIdx}
                      className={`w-4 h-4 ${
                        starIdx < t.rating
                          ? "text-amber-400 fill-amber-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  ))}
                </div>

                {/* Text */}
                <p className="text-sm text-on-surface-muted leading-relaxed flex-1 mb-4">
                  &ldquo;{t.text}&rdquo;
                </p>

                {/* Author */}
                <div className="flex items-center gap-3 pt-4 border-t border-surface-border">
                  <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-bold">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.university} · {t.workType}
                    </p>
                  </div>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
