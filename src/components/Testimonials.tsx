import { Star } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";

const testimonials = [
  {
    name: "Анна К.",
    university: "МГУ",
    workType: "Дипломная работа · 87 страниц",
    rating: 5,
    text: "Препод возвращал диплом 2 раза с пометкой «неправильное оформление» — каждый раз я тратила по 2 дня, правя отступы и заголовки вручную. Загрузила в Diplox — за 4 минуты получила готовый файл. Сдала с первого раза, нормоконтроль прошла без замечаний.",
    avatar: "/avatars/anna.jpg",
  },
  {
    name: "Дмитрий П.",
    university: "МФТИ",
    workType: "Курсовая работа · 42 страницы",
    rating: 5,
    text: "Загрузил методичку кафедры и документ — сервис за 3 минуты выставил поля 30-15-20-20, переформатировал 28 заголовков и оформил список из 35 источников по ГОСТ 7.1. Преподаватель не нашёл ни одной ошибки.",
    avatar: "/avatars/dmitry.jpg",
  },
  {
    name: "Мария С.",
    university: "ВШЭ",
    workType: "Реферат · 15 страниц",
    rating: 5,
    text: "Раньше тратила 40-60 минут на оформление каждого реферата. Теперь загружаю файл — через 2 минуты всё готово: шрифт, интервалы, нумерация. За семестр сэкономила около 8 часов на 12 работах.",
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
            Отзывы пользователей Diplox
          </p>
        </BlurFade>

        <div className="grid gap-6 md:grid-cols-3">
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
                  {t.avatar ? (
                    <img
                      src={t.avatar}
                      alt={t.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center text-background text-sm font-bold">
                      {t.name.charAt(0)}
                    </div>
                  )}
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
