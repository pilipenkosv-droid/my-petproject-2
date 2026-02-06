import Link from "next/link";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { getBreadcrumbSchema, getFAQPageSchema } from "@/lib/seo/schemas";
import {
  Sparkles,
  CheckCircle,
  ArrowRight,
  FileText,
  Clock,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

export interface WorkTypeFAQ {
  question: string;
  answer: string;
}

export interface WorkTypeGostRequirement {
  name: string;
  value: string;
}

export interface WorkTypeLandingProps {
  type: string;
  title: string;
  subtitle: string;
  description: string;
  breadcrumbName: string;
  breadcrumbPath: string;
  features: string[];
  gostRequirements: WorkTypeGostRequirement[];
  faqs: WorkTypeFAQ[];
  relatedTypes: { name: string; href: string }[];
}

export function WorkTypeLanding({
  type,
  title,
  subtitle,
  description,
  breadcrumbName,
  breadcrumbPath,
  features,
  gostRequirements,
  faqs,
  relatedTypes,
}: WorkTypeLandingProps) {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      {/* JSON-LD Schema */}
      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: breadcrumbName, url: breadcrumbPath },
        ])}
      />
      <JsonLd data={getFAQPageSchema(faqs)} />

      <main className="mx-auto max-w-4xl px-6 py-16">
        {/* Hero секция */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-6">
            <FileText className="w-4 h-4" />
            {type}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {title}
          </h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto mb-8">
            {subtitle}
          </p>
          <Link
            href="/create"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-violet-500 text-white font-medium hover:bg-violet-600 transition-colors text-lg"
          >
            Отформатировать бесплатно
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Описание */}
        <section className="mb-12">
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <p className="text-white/70 leading-relaxed">{description}</p>
          </div>
        </section>

        {/* Что делает сервис */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">
              Что делает SmartFormat
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-3 bg-white/5 rounded-xl border border-white/10 p-4"
              >
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-white/80">{feature}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Требования ГОСТ */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">
              Стандартные требования по ГОСТу
            </h2>
          </div>

          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full">
              <tbody>
                {gostRequirements.map((req, index) => (
                  <tr
                    key={index}
                    className={index !== gostRequirements.length - 1 ? "border-b border-white/10" : ""}
                  >
                    <td className="px-4 py-3 text-white/60">{req.name}</td>
                    <td className="px-4 py-3 text-white font-medium text-right">
                      {req.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-white/40 text-sm mt-3">
            * Параметры могут отличаться в зависимости от требований вашего вуза
          </p>
        </section>

        {/* Преимущества */}
        <section className="mb-12">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-xl border border-white/10 p-5 text-center">
              <Clock className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-medium text-white mb-1">Быстро</h3>
              <p className="text-white/50 text-sm">Обработка за 3-5 минут</p>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 p-5 text-center">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
              <h3 className="font-medium text-white mb-2">Безопасно</h3>
              <p className="text-white/50 text-sm mb-1">Не попадает в Антиплагиат</p>
              <p className="text-white/30 text-xs">Файлы удаляются через 24ч</p>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 p-5 text-center">
              <Sparkles className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-medium text-white mb-1">Точно</h3>
              <p className="text-white/50 text-sm">AI-анализ методички</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">Частые вопросы</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((item, index) => (
              <details
                key={index}
                className="group bg-white/5 rounded-xl border border-white/10 overflow-hidden"
              >
                <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors">
                  <h3 className="font-medium text-white pr-4">{item.question}</h3>
                  <ChevronRight className="w-5 h-5 text-white/40 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-5 pb-5 pt-0">
                  <p className="text-white/70 leading-relaxed">{item.answer}</p>
                </div>
              </details>
            ))}
          </div>

          <div className="text-center mt-6">
            <Link
              href="/faq"
              className="text-violet-400 hover:text-violet-300 text-sm transition-colors"
            >
              Все вопросы и ответы →
            </Link>
          </div>
        </section>

        {/* Другие типы работ */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-4">
            Другие типы работ
          </h2>
          <div className="flex flex-wrap gap-3">
            {relatedTypes.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-2xl border border-violet-500/20 p-8">
            <Sparkles className="w-8 h-8 text-violet-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">
              Готовы оформить работу?
            </h2>
            <p className="text-white/60 mb-6">
              Первый документ форматируется бесплатно — оцените качество
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/create"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-violet-500 text-white font-medium hover:bg-violet-600 transition-colors"
              >
                Начать форматирование
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
              >
                Посмотреть тарифы
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
