import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuroraText } from "@/components/ui/aurora-text";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Header } from "@/components/Header";
import { FileText, Sparkles, Zap, Download } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <Header />

      {/* Hero Section with Animated Grid */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-6 py-24 sm:py-32">
        {/* Animated Grid Pattern */}
        <AnimatedGridPattern
          numSquares={30}
          maxOpacity={0.3}
          duration={3}
          repeatDelay={1}
          className="[mask-image:radial-gradient(600px_circle_at_center,white,transparent)]"
        />
        
        {/* Background mesh gradient */}
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        
        {/* Floating decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Large blurred circles */}
          <div className="absolute top-20 left-10 w-72 h-72 bg-violet-500/30 rounded-full blur-[100px] animate-pulse-glow" />
          <div className="absolute top-40 right-20 w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-fuchsia-500/20 rounded-full blur-[100px] animate-pulse-glow" style={{ animationDelay: '4s' }} />
          
          {/* Floating geometric shapes */}
          <div className="absolute top-32 right-1/4 w-20 h-20 border border-white/20 rounded-2xl rotate-12 animate-float" />
          <div className="absolute bottom-40 left-20 w-16 h-16 border border-violet-400/30 rounded-full animate-float-slow" />
          <div className="absolute top-1/2 right-10 w-12 h-12 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-xl rotate-45 animate-float" style={{ animationDelay: '1s' }} />
        </div>
        
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Badge */}
          <BlurFade delay={0.1} inView>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-8">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-sm text-white/80">Powered by AI</span>
            </div>
          </BlurFade>
          
          <BlurFade delay={0.15} inView>
            <div className="flex justify-center mb-6">
              <Logo variant="dark" size={64} />
            </div>
          </BlurFade>

          <BlurFade delay={0.2} inView>
            <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight mb-6">
              <AuroraText colors={["#FF0080", "#7928CA", "#0070F3", "#38bdf8"]}>
                Smart
              </AuroraText>
              <span className="text-white">Format</span>
            </h1>
          </BlurFade>
          
          <BlurFade delay={0.3} inView>
            <p className="text-xl sm:text-2xl text-white/70 mb-4 font-medium">
              Идеальное оформление научной работы по методичке
            </p>
          </BlurFade>
          
          <BlurFade delay={0.4} inView>
            <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
              Загрузите курсовую или диплом в .docx и методичку вашего вуза —
              нейросеть автоматически оформит отступы, шрифты, заголовки и список литературы по ГОСТу.
            </p>
          </BlurFade>
          
          <BlurFade delay={0.5} inView>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/create" className="w-full sm:w-auto">
                <ShimmerButton className="text-lg w-full sm:w-auto">
                  <Zap className="w-5 h-5 mr-2" />
                  Начать форматирование
                </ShimmerButton>
              </Link>
              <Button size="lg" variant="outline" className="text-lg px-8 py-7 w-full sm:w-auto" asChild>
                <a href="#how-it-works">Как это работает</a>
              </Button>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative py-24 px-6 scroll-mt-20">
        <div className="mx-auto max-w-5xl">
          <BlurFade delay={0.1} inView>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
              <AuroraText colors={["#7928CA", "#FF0080", "#0070F3"]}>
                Как это работает
              </AuroraText>
            </h2>
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <p className="text-center text-white/50 mb-16 max-w-xl mx-auto">
              Всего 4 простых шага до идеально оформленного документа
            </p>
          </BlurFade>
          
          <div className="grid gap-6 md:grid-cols-4">
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
            ].map((item) => (
              <BlurFade key={item.step} delay={item.delay} inView>
                <div 
                  className="group relative p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(139,92,246,0.15)] h-full"
                >
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} text-white text-lg font-bold mb-4 shadow-lg`}>
                    <item.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">
                    {item.description}
                  </p>
                  
                  {/* Step number */}
                  <div className="absolute top-4 right-4 text-5xl font-bold text-white/5 group-hover:text-white/10 transition-colors">
                    {item.step}
                  </div>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section className="relative py-24 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-500/5 to-transparent" />
        
        <div className="relative mx-auto max-w-4xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Забудьте о ручной настройке отступов и шрифтов
          </h2>
          <p className="text-center text-white/50 mb-12 max-w-xl mx-auto">
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
                className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 p-4 transition-all duration-300 hover:bg-red-500/5 hover:border-red-500/20 group"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center group-hover:bg-red-500/30 transition-colors">
                  <span className="text-red-400 text-sm">✕</span>
                </div>
                <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">{pain}</span>
              </div>
            ))}
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
            <div className="absolute inset-0 border border-white/10 rounded-3xl" />
            
            <div className="relative text-center">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Готовы сэкономить время?
              </h2>
              <p className="text-white/60 mb-8 max-w-md mx-auto">
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

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo variant="favicon" size={24} withText />
          </div>
          <p className="text-sm text-white/40">
            Сервис автоматического форматирования курсовых и дипломных работ по ГОСТу
          </p>
        </div>
      </footer>
    </main>
  );
}
