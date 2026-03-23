import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/ui/blur-fade";
import { Header } from "@/components/Header";
import { CtaButton } from "@/components/CtaButton";
import { FileText, Sparkles, Download, ArrowRight, BookOpen, SpellCheck, Pencil, ListTree, FileCheck, ShieldCheck, Bot } from "lucide-react";

import { HeroSubtitle } from "@/components/HeroSubtitle";
import { StatsCounter } from "@/components/StatsCounter";
import { BeforeAfter } from "@/components/BeforeAfter";
import { Testimonials } from "@/components/Testimonials";

import { TextRibbonSection } from "@/components/TextRibbonSection";
import { TransformationStory } from "@/components/TransformationStory";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Header />

      {/* Bot announcement banner */}
      <div className="bg-gradient-to-r from-purple-600/10 via-indigo-600/10 to-purple-600/10 border-b border-purple-500/20 px-4 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-center gap-3 text-sm">
          <Bot className="w-4 h-4 text-primary shrink-0" />
          <span className="text-foreground font-medium">Новинка: AI-напарник для студентов</span>
          <span className="text-on-surface-muted hidden sm:inline">— 10 мест в закрытом альфа-тесте</span>
          <Link href="/bot" className="inline-flex items-center gap-1 text-primary font-semibold hover:text-primary/80 transition-colors shrink-0">
            Узнать <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative flex items-center justify-center px-4 sm:px-6 py-16 sm:py-24">
        
        <div className="relative z-10 mx-auto max-w-5xl w-full">
          {/* Text column — centered */}
          <div className="text-center">
            {/* Badge */}
            <BlurFade delay={0.2} inView>
              <HeroSubtitle />
            </BlurFade>

            <BlurFade delay={0.4} inView>
              <p className="text-lg text-on-surface-subtle max-w-2xl mx-auto mb-10 leading-relaxed">
                Ты написал работу. Диплом оформим мы — по твоей методичке, по ГОСТу.
                <br />
                За три минуты. Сдаёшь с первого раза — без замечаний.
              </p>
            </BlurFade>

            <BlurFade delay={0.5} inView>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <div className="w-full sm:w-auto">
                  <CtaButton className="text-base sm:text-lg w-full sm:w-auto px-6 sm:px-8" />
                </div>
                <Button size="lg" variant="outline" className="text-base sm:text-lg px-6 sm:px-8 w-full sm:w-auto" asChild>
                  <a href="#how-it-works">Как это работает</a>
                </Button>
              </div>
            </BlurFade>

            {/* Text ribbon — before/after animation */}
            <div className="mt-12 -mx-4 sm:-mx-6">
              <TextRibbonSection />
            </div>

            <div className="mt-12">
              <StatsCounter />
            </div>
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

      {/* Transformation Story */}
      <TransformationStory />

      {/* Tools showcase */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-5xl">
          <BlurFade delay={0.1} inView>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
Всё, что нужно, чтобы сдать без замечаний
            </h2>
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
              Шесть проблем — шесть решений. Без лишних шагов.
            </p>
          </BlurFade>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 grid-rows-[1fr_1fr]">
            {[
              {
                href: "/create",
                icon: FileCheck,
                label: "Форматирование по ГОСТу",
                desc: "Нормоконтроль пройдён. С первого раза.",
                gradient: "from-foreground to-foreground",
                delay: 0.3,
              },
              {
                href: "/outline",
                icon: ListTree,
                label: "Генератор плана",
                desc: "Чистый лист → готовая структура за 60 секунд",
                gradient: "from-brand-teal to-brand-teal-dark",
                delay: 0.35,
              },
              {
                href: "/grammar",
                icon: SpellCheck,
                label: "Проверка грамматики",
                desc: "Преподаватель не найдёт, что подчеркнуть красным",
                gradient: "from-foreground to-foreground",
                delay: 0.4,
              },
              {
                href: "/rewrite",
                icon: Pencil,
                label: "Повышение уникальности",
                desc: "Твой текст, твои мысли — уникальность растёт",
                gradient: "from-brand-teal-dark to-brand-teal",
                delay: 0.45,
              },
              {
                href: "/summarize",
                icon: Sparkles,
                label: "Краткое содержание",
                desc: "Аннотация за 30 секунд — не за час",
                gradient: "from-brand-teal-light to-brand-teal",
                delay: 0.5,
              },
              {
                href: "/sources",
                icon: BookOpen,
                label: "Подбор литературы",
                desc: "Реальные источники. Не выдуманные ссылки.",
                gradient: "from-foreground to-foreground",
                delay: 0.55,
              },
            ].map((tool) => {
              const ToolIcon = tool.icon;
              return (
                <BlurFade key={tool.href} delay={tool.delay} inView className="h-full">
                  <Link
                    href={tool.href}
                    className="flex items-start gap-4 bg-surface border border-surface-border p-5 hover:bg-surface-hover hover:-translate-y-1 hover:shadow-md transition-all duration-300 group h-full"
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

      {/* Testimonials */}
      <Testimonials />

      {/* Безопасность от антиплагиата */}
      <section className="relative py-16 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="bg-surface border border-surface-border p-8 md:p-10">
            <div className="flex items-start gap-5">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0 mt-1">
                <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
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
                Следующую работу сдашь с первого раза.
              </h2>
              <p className="text-on-surface-muted mb-8 max-w-md mx-auto">
                Попробуй бесплатно — первая обработка в подарок. Без риска.
              </p>
              <CtaButton className="w-full sm:w-auto" />
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
