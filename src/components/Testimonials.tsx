import { Star } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";

const testimonials = [
  {
    name: "Анна К.",
    university: "МГУ",
    workType: "Дипломная работа",
    rating: 5,
    text: "Сдала диплом с первого раза! Препод возвращал работу с пометкой «неправильное оформление», даже не объяснял что именно не так — 2 раза я тратила по 2 дня на оформление, а теперь за 5 минут и сразу всё идеально.",
  },
  {
    name: "Дмитрий П.",
    university: "МФТИ",
    workType: "Курсовая работа",
    rating: 5,
    text: "Загрузил методичку кафедры и документ — сервис сам всё подправил. Преподаватель не нашёл ни одной ошибки в оформлении.",
  },
  {
    name: "Мария С.",
    university: "ВШЭ",
    workType: "Реферат",
    rating: 4,
    text: "Очень удобно, особенно режим ГОСТ. Не нужно даже искать методичку — стандартные правила уже встроены.",
  },
];

export function Testimonials() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Что говорят студенты
          </h2>
          <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
            Отзывы пользователей SmartFormat
          </p>
        </BlurFade>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <BlurFade key={i} delay={0.2 + i * 0.1} inView>
              <div className="bg-surface rounded-2xl border border-surface-border p-6 h-full flex flex-col">
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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
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
