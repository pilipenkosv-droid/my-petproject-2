import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { AuroraText } from "@/components/ui/aurora-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { Header } from "@/components/Header";
import { CtaButton } from "@/components/CtaButton";
import { FileText, Sparkles, Zap, Download, ArrowRight, BookOpen, SpellCheck, Pencil } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { HeroSubtitle } from "@/components/HeroSubtitle";
import { Footer } from "@/components/Footer";
import { StatsCounter } from "@/components/StatsCounter";
import { BeforeAfter } from "@/components/BeforeAfter";
import { Testimonials } from "@/components/Testimonials";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <Header />

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 sm:px-6 py-24 sm:py-32">
        {/* Background mesh gradient */}
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />

        {/* Single soft glow accent */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-500/15 rounded-full blur-[150px]" />
        </div>
        
        {/* Mascot — fixed bottom-left, looking at hero text (desktop only) */}
        <div className="hidden md:block absolute bottom-0 left-0 z-20 pointer-events-none">
          <BlurFade delay={0.6} inView>
            <Image
              src="/mascot/hero-light.png"
              alt="Дипломированный диплодок — маскот Diplox"
              width={1536}
              height={1024}
              className="w-48 lg:w-64 xl:w-72 h-auto drop-shadow-2xl"
              priority
            />
          </BlurFade>
        </div>

        <div className="relative z-10 mx-auto max-w-4xl w-full">
          {/* Text column — centered */}
          <div className="text-center md:text-left">
            {/* Badge */}
            <BlurFade delay={0.1} inView>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-surface-border backdrop-blur-sm mb-8">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-on-surface">Powered by AI</span>
              </div>
            </BlurFade>

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
              <AuroraText colors={["#7928CA", "#FF0080", "#0070F3"]}>
                Как это работает
              </AuroraText>
            </h2>
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <p className="text-center text-on-surface-subtle mb-16 max-w-xl mx-auto">
              Всего 4 простых шага до идеально оформленного документа
            </p>
          </BlurFade>

          {/* Timeline */}
          <div className="flex flex-col md:flex-row md:items-stretch md:gap-0 gap-0">
            {[
              {
                step: "1",
                icon: FileText,
                title: "Загрузите документ",
                description: "Отправьте курсовую, диплом или научную работу в формате .docx",
                gradient: "from-violet-500 to-purple-600",
                delay: 0.3,
              },
              {
                step: "2",
                icon: FileText,
                title: "Добавьте методичку",
                description: "Загрузите методические указания или требования к оформлению от вашего вуза",
                gradient: "from-indigo-500 to-blue-600",
                delay: 0.4,
              },
              {
                step: "3",
                icon: Sparkles,
                title: "ИИ-обработка",
                description: "Нейросеть считывает требования и автоматически исправляет форматирование по ГОСТу",
                gradient: "from-fuchsia-500 to-pink-600",
                delay: 0.5,
              },
              {
                step: "4",
                icon: Download,
                title: "Скачайте результат",
                description: "Получите идеально оформленный документ, готовый к сдаче",
                gradient: "from-emerald-500 to-teal-600",
                delay: 0.6,
              },
            ].map((item, index) => (
              <BlurFade key={item.step} delay={item.delay} inView className="flex-1">
                {/* Mobile layout (vertical timeline) */}
                <div className="flex md:hidden">
                  {/* Left: circle + vertical line */}
                  <div className="flex flex-col items-center mr-4">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.gradient} text-white font-bold flex items-center justify-center text-sm shadow-lg flex-shrink-0`}>
                      {item.step}
                    </div>
                    {index < 3 && (
                      <div className="w-0 flex-1 border-l-2 border-dashed border-surface-border my-2" />
                    )}
                  </div>
                  {/* Right: card content */}
                  <div className={`group p-5 rounded-2xl bg-surface border border-surface-border backdrop-blur-sm transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-surface-hover hover:shadow-[0_20px_40px_rgba(139,92,246,0.15)] flex-1 ${index < 3 ? "mb-4" : ""}`}>
                    <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} text-white text-lg font-bold mb-4 shadow-lg`}>
                      <item.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                    <p className="text-sm text-on-surface-muted leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Desktop layout (horizontal timeline) */}
                <div className="hidden md:flex flex-col items-center h-full">
                  {/* Top: circle + horizontal connector */}
                  <div className="flex items-center w-full mb-6">
                    <div className="flex-1">
                      {index > 0 && (
                        <div className="border-t-2 border-dashed border-surface-border w-full" />
                      )}
                    </div>
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.gradient} text-white font-bold flex items-center justify-center text-sm shadow-lg flex-shrink-0 mx-1`}>
                      {item.step}
                    </div>
                    <div className="flex-1">
                      {index < 3 && (
                        <div className="border-t-2 border-dashed border-surface-border w-full" />
                      )}
                    </div>
                  </div>
                  {/* Bottom: card */}
                  <div className="group p-6 rounded-2xl bg-surface border border-surface-border backdrop-blur-sm transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-surface-hover hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(139,92,246,0.15)] w-full flex-1">
                    <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} text-white text-lg font-bold mb-4 shadow-lg`}>
                      <item.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                    <p className="text-sm text-on-surface-muted leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </BlurFade>
            ))}
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
              <AuroraText colors={["#7928CA", "#FF0080", "#0070F3"]}>
                Все инструменты для вашей работы
              </AuroraText>
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
                icon: FileText,
                label: "Форматирование по ГОСТу",
                desc: "Загрузите документ и методичку — ИИ оформит по стандарту",
                gradient: "from-violet-500 to-purple-600",
                delay: 0.3,
              },
              {
                href: "/outline",
                icon: FileText,
                label: "Генератор плана",
                desc: "Создайте структуру курсовой или диплома с помощью ИИ",
                gradient: "from-indigo-500 to-violet-600",
                delay: 0.35,
              },
              {
                href: "/grammar",
                icon: SpellCheck,
                label: "Проверка грамматики",
                desc: "Проверьте текст на орфографические и пунктуационные ошибки",
                gradient: "from-red-500 to-rose-600",
                delay: 0.4,
              },
              {
                href: "/rewrite",
                icon: Pencil,
                label: "Повышение уникальности",
                desc: "Перепишите текст с сохранением смысла для антиплагиата",
                gradient: "from-amber-500 to-orange-600",
                delay: 0.45,
              },
              {
                href: "/summarize",
                icon: Sparkles,
                label: "Краткое содержание",
                desc: "Сгенерируйте аннотацию или резюме вашей работы",
                gradient: "from-emerald-500 to-teal-600",
                delay: 0.5,
              },
              {
                href: "/sources",
                icon: BookOpen,
                label: "Подбор литературы",
                desc: "Найдите реальные научные источники из OpenAlex и CrossRef",
                gradient: "from-teal-500 to-cyan-600",
                delay: 0.55,
              },
            ].map((tool) => {
              const ToolIcon = tool.icon;
              return (
                <BlurFade key={tool.href} delay={tool.delay} inView>
                  <Link
                    href={tool.href}
                    className="flex items-start gap-4 bg-surface rounded-2xl border border-surface-border p-5 hover:bg-surface-hover hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(139,92,246,0.1)] transition-all duration-300 group h-full"
                  >
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shrink-0 shadow-lg`}
                    >
                      <ToolIcon className="w-5 h-5 text-white" />
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
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-500/5 to-transparent" />
        
        <div className="relative mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            Забудьте о ручной настройке отступов и шрифтов
          </h2>
          <p className="text-center text-on-surface-subtle mb-12 max-w-xl mx-auto">
            Больше не нужно вручную искать ошибки форматирования — ИИ сделает это за вас
          </p>
          
          <div className="grid gap-3 md:grid-cols-2">
            {[
              "Где нет неразрывных пробелов перед единицами измерения",
              "Где неверные межстрочные интервалы и абзацные отступы",
              "Где не соблюдены поля документа",
              "Где неправильный шрифт или его размер",
              "Где заголовки оформлены не по требованиям",
              "Где нарушено оформление списка литературы",
              "Где рисунки и таблицы подписаны не по стандарту",
              "Где нумерация страниц начинается не с того места",
            ].map((pain, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl bg-surface border border-surface-border p-4 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/5 hover:border-red-500/20 group"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center group-hover:bg-red-500/30 transition-colors">
                  <span className="text-red-400 text-sm">✕</span>
                </div>
                <span className="text-sm text-on-surface-muted group-hover:text-foreground/90 transition-colors">{pain}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials />

      {/* Безопасность от антиплагиата */}
      <section className="relative py-16 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent rounded-2xl border border-emerald-500/20 p-8 md:p-10">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <Mascot
                src="/mascot/security.png"
                alt="Диплодок с щитом защиты"
                width={402}
                height={385}
                className="shrink-0 w-16 sm:w-20 md:w-24"
              />
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
          <div className="relative rounded-3xl p-12 overflow-hidden">
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-indigo-600/20 to-fuchsia-600/20" />
            <div className="absolute inset-0 backdrop-blur-xl" />
            <div className="absolute inset-0 border border-surface-border rounded-3xl" />
            
            <div className="relative text-center">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Готовы сэкономить время?
              </h2>
              <p className="text-on-surface-muted mb-8 max-w-md mx-auto">
                Загрузите документ и методичку — получите идеально оформленную работу по ГОСТу
              </p>
              <Link href="/create" className="w-full sm:w-auto">
                <Button size="lg" variant="glow" className="w-full sm:w-auto">
                  <Zap className="w-5 h-5" />
                  Начать форматирование
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
