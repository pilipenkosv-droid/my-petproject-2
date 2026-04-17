import Link from "next/link";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { getBreadcrumbSchema, getFAQPageSchema } from "@/lib/seo/schemas";
import {
  Sparkles,
  CheckCircle,
  ArrowRight,
  FileText,
  ChevronRight,
} from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { CtaButton } from "@/components/CtaButton";
import {
  WorkTypeBenefits,
  type WorkTypeBenefit,
} from "@/components/WorkTypeBenefits";
import {
  WorkTypeTestimonials,
  type WorkTypeTestimonial,
} from "@/components/WorkTypeTestimonials";
import {
  WorkTypeWorkflow,
  type WorkTypeWorkflowStep,
} from "@/components/WorkTypeWorkflow";
import { getPostsForWorkType } from "@/lib/blog/posts";

export interface WorkTypeFAQ {
  question: string;
  answer: string;
}

export interface WorkTypeGostRequirement {
  name: string;
  value: string;
}

export interface WorkTypeLandingProps {
  slug: string;
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
  // Godin props
  identityLine?: string;
  benefits?: WorkTypeBenefit[];
  testimonials?: WorkTypeTestimonial[];
  featuresTitle?: string;
  bottomCtaTitle?: string;
  bottomCtaSubtitle?: string;
  bottomCtaLabel?: string;
  workflowSteps?: WorkTypeWorkflowStep[];
}

export function WorkTypeLanding({
  slug,
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
  identityLine,
  benefits,
  testimonials,
  featuresTitle,
  bottomCtaTitle,
  bottomCtaSubtitle,
  bottomCtaLabel,
  workflowSteps,
}: WorkTypeLandingProps) {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: breadcrumbName, url: breadcrumbPath },
        ])}
      />
      <JsonLd data={getFAQPageSchema(faqs)} />

      <PageHero
        badge={
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-border text-primary text-sm mb-6">
            <FileText className="w-4 h-4" />
            {type}
          </div>
        }
        title={title}
        subtitle={subtitle}
      >
        {identityLine && (
          <p className="text-on-surface-muted italic text-base mt-4 max-w-lg mx-auto">
            {identityLine}
          </p>
        )}
        <div className="mt-8 flex justify-center">
          <CtaButton className="text-base sm:text-lg px-6 sm:px-8" workType={slug} />
        </div>
      </PageHero>

      <main className="mx-auto max-w-4xl px-6 py-12">

        {/* 1. Соц. доказательство (Година: после идентичности) */}
        {testimonials && testimonials.length > 0 && (
          <WorkTypeTestimonials testimonials={testimonials} />
        )}

        {/* 2. Описание */}
        <section className="mb-12">
          <div className="bg-surface border border-surface-border p-6">
            <p className="text-on-surface-muted leading-relaxed">{description}</p>
          </div>
        </section>

        {/* 3. Механизм — что делает сервис */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground">
              {featuresTitle || "Что делает Diplox"}
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-3 bg-surface border border-surface-border p-4"
              >
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-on-surface">{feature}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 3b. Воркфлоу — последовательность инструментов */}
        {workflowSteps && workflowSteps.length > 0 && (
          <WorkTypeWorkflow steps={workflowSteps} />
        )}

        {/* 4. Выгоды (уникальные для типа) */}
        {benefits && benefits.length > 0 && (
          <WorkTypeBenefits benefits={benefits} />
        )}

        {/* 5. Требования ГОСТ */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground">
              Стандартные требования по ГОСТу
            </h2>
          </div>

          <div className="bg-surface border border-surface-border overflow-hidden">
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
            * Параметры по{" "}
            <a
              href="https://docs.cntd.ru/document/1200157208"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 underline"
            >
              ГОСТ 7.32-2017
            </a>
            . Могут отличаться в зависимости от требований вашего вуза.
          </p>
        </section>

        {/* 6. FAQ */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground">Частые вопросы</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((item, index) => (
              <details
                key={index}
                className="group bg-surface border border-surface-border overflow-hidden"
              >
                <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-surface-hover transition-colors">
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

        {/* 7. Bottom CTA */}
        <div className="text-center mb-12">
          <div className="bg-muted rounded-2xl border border-border p-8">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {bottomCtaTitle || "Готовы оформить работу?"}
            </h2>
            <p className="text-on-surface-muted mb-6">
              {bottomCtaSubtitle || "Первый документ форматируется бесплатно — оцените качество"}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={`/create?type=${slug}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
              >
                {bottomCtaLabel || "Начать форматирование"}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-surface border border-surface-border text-foreground font-medium hover:bg-surface-hover transition-colors"
              >
                Посмотреть тарифы
              </Link>
            </div>
          </div>
        </div>

        {/* 7b. Статьи из блога по теме */}
        {(() => {
          const posts = getPostsForWorkType(slug, 6);
          if (posts.length === 0) return null;
          return (
            <section className="mb-12">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Полезные статьи по теме
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {posts.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/blog/${p.slug}`}
                    className="group flex items-start gap-3 bg-surface border border-surface-border p-4 hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground text-sm font-medium group-hover:text-primary transition-colors mb-1 line-clamp-2">
                        {p.title}
                      </div>
                      <div className="text-muted-foreground text-xs line-clamp-2">
                        {p.description}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5" />
                  </Link>
                ))}
              </div>
              <div className="mt-4">
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                >
                  Все статьи блога
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </section>
          );
        })()}

        {/* 8. Другие типы работ */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Другие типы работ
          </h2>
          <div className="flex flex-wrap gap-3">
            {relatedTypes.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className="px-4 py-2 bg-surface border border-surface-border text-on-surface-muted hover:text-foreground hover:bg-surface-hover transition-colors text-sm"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
