import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/ui/blur-fade";
import { Header } from "@/components/Header";
import { CtaButton } from "@/components/CtaButton";
import { FileText, Sparkles, Zap, Download, ArrowRight, BookOpen, SpellCheck, Pencil, ListTree, FileCheck } from "lucide-react";

import { HeroSubtitle } from "@/components/HeroSubtitle";
import { StatsCounter } from "@/components/StatsCounter";
import { BeforeAfter } from "@/components/BeforeAfter";
import { Testimonials } from "@/components/Testimonials";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Header />

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 sm:px-6 py-24 sm:py-32">
        
        <div className="relative z-10 mx-auto max-w-4xl w-full">
          {/* Text column — centered */}
          <div className="text-center md:text-left">
            {/* Badge */}
            <BlurFade delay={0.2} inView>
              <HeroSubtitle />
            </BlurFade>

            <BlurFade delay={0.4} inView>
              <p className="text-lg text-on-surface-subtle max-w-2xl mx-auto md:mx-0 mb-10 leading-relaxed">
                Загрузите курсовую или диплом в .docx и методичку вашего вуза —
                нейросеть автоматически оформит отступы, шрифты, заголовки и список литературы по ГОСТу.
              </p>
            </BlurFade>

            <BlurFade delay={0.5} inView>
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start items-center">
                <div className="w-full sm:w-auto">
                  <CtaButton className="text-base sm:text-lg w-full sm:w-auto px-6 sm:px-8" />
                </div>
                <Button size="lg" variant="outline" className="text-base sm:text-lg px-6 sm:px-8 py-6 sm:py-7 w-full sm:w-auto" asChild>
                  <a href="#how-it-works">Как это работает</a>
                </Button>
              </div>
            </BlurFade>

            <StatsCounter />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative py-24 px-6 scroll-mt-20">
        <div className="mx-auto max-w-5xl">
          <BlurFade delay={0.1} inView>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
Как это работает
            </h2>
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <p className="text-center text-on-surface-subtle mb-16 max-w-xl mx-auto">
              Всего 4 простых шага до идеально оформленного документа
            </p>
          </BlurFade>

          {/* Steps grid — thin borders, no rounding (Vercel style) */}
          <div className="border border-border">
            <div className="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
              {[
                {
                  step: "01",
                  icon: FileText,
                  title: "Загрузите документ",
                  description: "Отправьте курсовую, диплом или научную работу в формате .docx",
                  delay: 0.3,
                },
                {
                  step: "02",
                  icon: FileText,
                  title: "Добавьте методичку",
                  description: "Загрузите методические указания или требования к оформлению от вашего вуза",
                  delay: 0.4,
                },
                {
                  step: "03",
                  icon: Sparkles,
                  title: "ИИ-обработка",
                  description: "Нейросеть считывает требования и автоматически исправляет форматирование по ГОСТу",
                  delay: 0.5,
                },
                {
                  step: "04",
                  icon: Download,
                  title: "Скачайте результат",
                  description: "Получите идеально оформленный документ, готовый к сдаче",
                  delay: 0.6,
                },
              ].map((item) => (
                <BlurFade key={item.step} delay={item.delay} inView className="flex-1">
                  <div className="p-6 h-full">
                    <span className="text-xs font-mono text-muted-foreground mb-4 block">{item.step}</span>
                    <item.icon className="w-5 h-5 text-foreground mb-3" />
                    <h3 className="text-sm font-semibold text-foreground mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </BlurFade>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Before / After */}
      <BeforeAfter />

      {/* Tools showcase */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-5xl">
          <BlurFade delay={0.1} inView>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
Все инструменты для вашей работы
            </h2>
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
              Форматирование, проверка грамматики, подбор литературы и другие AI-инструменты — всё в одном сервисе
            </p>
          </BlurFade>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                href: "/create",
                icon: FileCheck,
                label: "Форматирование по ГОСТу",
                desc: "Загрузите документ и методичку — ИИ оформит по стандарту",
                gradient: "from-foreground to-foreground",
                delay: 0.3,
              },
              {
                href: "/outline",
                icon: ListTree,
                label: "Генератор плана",
                desc: "Создайте структуру курсовой или диплома с помощью ИИ",
                gradient: "from-brand-teal to-brand-teal-dark",
                delay: 0.35,
              },
              {
                href: "/grammar",
                icon: SpellCheck,
                label: "Проверка грамматики",
                desc: "Проверьте текст на орфографические и пунктуационные ошибки",
                gradient: "from-foreground to-foreground",
                delay: 0.4,
              },
              {
                href: "/rewrite",
                icon: Pencil,
                label: "Повышение уникальности",
                desc: "Перепишите текст с сохранением смысла для антиплагиата",
                gradient: "from-brand-teal-dark to-brand-teal",
                delay: 0.45,
              },
              {
                href: "/summarize",
                icon: Sparkles,
                label: "Краткое содержание",
                desc: "Сгенерируйте аннотацию или резюме вашей работы",
                gradient: "from-brand-teal-light to-brand-teal",
                delay: 0.5,
              },
              {
                href: "/sources",
                icon: BookOpen,
                label: "Подбор литературы",
                desc: "Найдите реальные научные источники из OpenAlex и CrossRef",
                gradient: "from-foreground to-foreground",
                delay: 0.55,
              },
            ].map((tool) => {
              const ToolIcon = tool.icon;
              return (
                <BlurFade key={tool.href} delay={tool.delay} inView>
                  <Link
                    href={tool.href}
                    className="flex items-start gap-4 bg-surface rounded-2xl border border-surface-border p-5 hover:bg-surface-hover hover:-translate-y-1 hover:shadow-md transition-all duration-300 group h-full"
                  >
                    <div className="w-11 h-11 rounded-xl bg-foreground flex items-center justify-center shrink-0">
                      <ToolIcon className="w-5 h-5 text-background" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {tool.label}
                      </p>
                      <p className="text-sm text-on-surface-muted leading-relaxed">
                        {tool.desc}
                      </p>
                    </div>
                  </Link>
                </BlurFade>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section className="relative py-24 px-6">
        
        <div className="relative mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Забудьте о ручной настройке отступов и шрифтов
          </h2>
          <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
            Больше не нужно вручную искать ошибки форматирования — ИИ сделает это за вас
          </p>
          
          <div className="border border-border">
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0">
              {/* Left column */}
              <div className="divide-y divide-border md:border-r md:border-border">
                {[
                  "Где нет неразрывных пробелов перед единицами измерения",
                  "Где неверные межстрочные интервалы и абзацные отступы",
                  "Где не соблюдены поля документа",
                  "Где неправильный шрифт или его размер",
                ].map((pain, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="text-red-400 text-xs font-mono shrink-0">✕</span>
                    <span className="text-sm text-muted-foreground">{pain}</span>
                  </div>
                ))}
              </div>
              {/* Right column */}
              <div className="divide-y divide-border">
                {[
                  "Где заголовки оформлены не по требованиям",
                  "Где нарушено оформление списка литературы",
                  "Где рисунки и таблицы подписаны не по стандарту",
                  "Где нумерация страниц начинается не с того места",
                ].map((pain, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="text-red-400 text-xs font-mono shrink-0">✕</span>
                    <span className="text-sm text-muted-foreground">{pain}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials />

      {/* Безопасность от антиплагиата */}
      <section className="relative py-16 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="bg-surface rounded-2xl border border-surface-border p-8 md:p-10">
            <div className="flex flex-col items-start gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3">
                  Не попадает в базы антиплагиата
                </h2>
                <p className="text-on-surface-muted mb-4 leading-relaxed max-w-2xl">
                  Diplox — сервис форматирования, не система проверки.
                  Мы используем Google Gemini и Groq для анализа методички, но не имеем
                  доступа к Антиплагиат.ВУЗ и не передаём документы в университетские базы.
                  Оригинальность вашей работы не изменится.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/blog/bezopasnost-antiplagiat"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-hover hover:bg-surface-hover text-foreground text-sm transition-colors"
                  >
                    Подробнее о безопасности
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl p-12 bg-surface border border-surface-border">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Готовы сэкономить время?
              </h2>
              <p className="text-on-surface-muted mb-8 max-w-md mx-auto">
                Загрузите документ и методичку — получите идеально оформленную работу по ГОСТу
              </p>
              <Link href="/create" className="w-full sm:w-auto">
                <Button size="lg" variant="default" className="w-full sm:w-auto">
                  <Zap className="w-5 h-5" />
                  Начать форматирование
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
