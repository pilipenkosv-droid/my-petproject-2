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
import { PageHero } from "@/components/PageHero";

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

      <PageHero
        badge={
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-6">
            <FileText className="w-4 h-4" />
            {type}
          </div>
        }
        title={title}
        subtitle={subtitle}
      >
        <Link
          href="/create"
          className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-violet-500 text-white font-medium hover:bg-violet-600 transition-colors text-lg mt-8"
        >
          Отформатировать бесплатно
          <ArrowRight className="w-5 h-5" />
        </Link>
      </PageHero>

      <main className="mx-auto max-w-4xl px-6 py-12">

        {/* Описание */}
        <section className="mb-12">
          <div className="bg-surface rounded-xl border border-surface-border p-6">
            <p className="text-on-surface-muted leading-relaxed">{description}</p>
          </div>
        </section>

        {/* Что делает сервис */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Что делает SmartFormat
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-3 bg-surface rounded-xl border border-surface-border p-4"
              >
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-on-surface">{feature}</span>
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
            <h2 className="text-xl font-semibold text-foreground">
              Стандартные требования по ГОСТу
            </h2>
          </div>

          <div className="bg-surface rounded-xl border border-surface-border overflow-hidden">
            <table className="w-full">
              <tbody>
                {gostRequirements.map((req, index) => (
                  <tr
                    key={index}
                    className={index !== gostRequirements.length - 1 ? "border-b border-surface-border" : ""}
                  >
                    <td className="px-4 py-3 text-on-surface-muted">{req.name}</td>
                    <td className="px-4 py-3 text-foreground font-medium text-right">
                      {req.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-sm mt-3">
            * Параметры могут отличаться в зависимости от требований вашего вуза
          </p>
        </section>

        {/* Преимущества */}
        <section className="mb-12">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-surface rounded-xl border border-surface-border p-5 text-center">
              <Clock className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-medium text-foreground mb-1">Быстро</h3>
              <p className="text-on-surface-subtle text-sm">Обработка за 3-5 минут</p>
            </div>
            <div className="bg-surface rounded-xl border border-surface-border p-5 text-center">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
              <h3 className="font-medium text-foreground mb-2">Безопасно</h3>
              <p className="text-on-surface-subtle text-sm mb-1">Не попадает в Антиплагиат</p>
              <p className="text-muted-foreground/60 text-xs">Файлы удаляются через 24ч</p>
            </div>
            <div className="bg-surface rounded-xl border border-surface-border p-5 text-center">
              <Sparkles className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-medium text-foreground mb-1">Точно</h3>
              <p className="text-on-surface-subtle text-sm">AI-анализ методички</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Частые вопросы</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((item, index) => (
              <details
                key={index}
                className="group bg-surface rounded-xl border border-surface-border overflow-hidden"
              >
                <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-surface transition-colors">
                  <h3 className="font-medium text-foreground pr-4">{item.question}</h3>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-5 pb-5 pt-0">
                  <p className="text-on-surface-muted leading-relaxed">{item.answer}</p>
                </div>
              </details>
            ))}
          </div>

          <div className="text-center mt-6">
            <Link
              href="/faq"
              className="text-primary hover:text-primary/80 text-sm transition-colors"
            >
              Все вопросы и ответы →
            </Link>
          </div>
        </section>

        {/* Другие типы работ */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Другие типы работ
          </h2>
          <div className="flex flex-wrap gap-3">
            {relatedTypes.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className="px-4 py-2 rounded-full bg-surface border border-surface-border text-on-surface-muted hover:text-foreground hover:bg-surface-hover transition-colors text-sm"
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
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Готовы оформить работу?
            </h2>
            <p className="text-on-surface-muted mb-6">
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
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-surface-hover text-foreground font-medium hover:bg-surface transition-colors"
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
