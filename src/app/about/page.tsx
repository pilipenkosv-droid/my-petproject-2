import { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { getBreadcrumbSchema, getHowToSchema } from "@/lib/seo/schemas";
import { SITE_URL } from "@/lib/config/site";
import {
  Sparkles,
  FileText,
  Cpu,
  CheckCircle,
  ArrowRight,
  Shield,
  Zap,
  Clock,
  Target,
} from "lucide-react";

export const metadata: Metadata = {
  title: "О сервисе Diplox — автоформатирование по ГОСТу",
  description:
    "Diplox — сервис автоматического форматирования научных работ по ГОСТу и методичке вуза. AI-анализ требований, мгновенная обработка, сохранение структуры текста.",
  keywords: [
    "о сервисе Diplox",
    "автоформатирование по ГОСТу",
    "AI форматирование документов",
    "как работает Diplox",
  ],
  alternates: {
    canonical: `${SITE_URL}/about`,
  },
};

const features = [
  {
    icon: Cpu,
    title: "AI-анализ методички",
    description:
      "Искусственный интеллект извлекает требования к оформлению из методических указаний вашего вуза — шрифты, отступы, интервалы, поля.",
  },
  {
    icon: Zap,
    title: "Мгновенная обработка",
    description:
      "Форматирование документа занимает от 1 до 5 минут. Даже объемная дипломная работа обрабатывается быстрее, чем вы успеете заварить чай.",
  },
  {
    icon: FileText,
    title: "Сохранение структуры",
    description:
      "Сервис не изменяет текст и содержание вашей работы. Меняется только визуальное оформление согласно требованиям.",
  },
  {
    icon: Shield,
    title: "Безопасность данных",
    description:
      "Документы передаются по защищенному каналу и автоматически удаляются через 24 часа. Файлы не попадают в базы антиплагиата.",
  },
];

const howItWorks = [
  {
    step: 1,
    title: "Загрузите документы",
    description:
      "Загрузите вашу работу в формате .docx и методические указания вуза (.docx или .pdf).",
  },
  {
    step: 2,
    title: "AI анализирует требования",
    description:
      "Система извлекает из методички параметры оформления: шрифты, размеры, отступы, интервалы.",
  },
  {
    step: 3,
    title: "Проверьте правила",
    description:
      "Посмотрите извлеченные правила и при необходимости скорректируйте их перед применением.",
  },
  {
    step: 4,
    title: "Скачайте результат",
    description:
      "Получите отформатированный документ в формате .docx, готовый к сдаче.",
  },
];

const stats = [
  { value: "5 мин", label: "среднее время обработки" },
  { value: ".docx", label: "поддерживаемый формат" },
  { value: "24ч", label: "автоудаление файлов" },
  { value: "0₽", label: "первый документ" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      {/* JSON-LD Schema */}
      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "О сервисе", url: "/about" },
        ])}
      />
      <JsonLd
        data={getHowToSchema(
          "Как отформатировать работу по ГОСТу в Diplox",
          "Пошаговая инструкция по автоматическому форматированию научной работы",
          howItWorks.map((item) => ({
            name: item.title,
            text: item.description,
          }))
        )}
      />

      <main className="mx-auto max-w-4xl px-6 py-16">
        {/* Hero секция */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            О сервисе
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Автоматическое форматирование
            <br />
            научных работ по ГОСТу
          </h1>
          <p className="text-on-surface-muted text-lg max-w-2xl mx-auto">
            Diplox использует искусственный интеллект для анализа
            методических указаний вашего вуза и автоматического применения
            требований к оформлению документа.
          </p>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-surface rounded-xl border border-surface-border p-4 text-center"
            >
              <div className="text-2xl font-bold text-foreground mb-1">
                {stat.value}
              </div>
              <div className="text-on-surface-subtle text-sm">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Как это работает */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Target className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Как это работает
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {howItWorks.map((item) => (
              <div
                key={item.step}
                className="bg-surface rounded-xl border border-surface-border p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground mb-2">{item.title}</h3>
                    <p className="text-on-surface-muted text-sm">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Возможности */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Возможности сервиса
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="bg-surface rounded-xl border border-surface-border p-6"
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-on-surface-muted text-sm">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* AI технологии */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Cpu className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Технологии искусственного интеллекта
            </h2>
          </div>

          <div className="bg-surface rounded-xl border border-surface-border p-6">
            <p className="text-on-surface-muted leading-relaxed mb-4">
              Diplox использует современные языковые модели для анализа
              текстовых документов. Система способна понимать естественный язык
              методических указаний и извлекать из них конкретные параметры
              форматирования.
            </p>
            <p className="text-on-surface-muted leading-relaxed mb-4">
              В основе работы лежат модели GPT-4o, Claude и Gemini — в
              зависимости от типа задачи система выбирает оптимальный инструмент
              для достижения наилучшего результата.
            </p>
            <p className="text-on-surface-muted leading-relaxed">
              Такой подход позволяет обрабатывать даже нестандартные методички с
              необычными требованиями, которые невозможно было бы учесть в
              обычной программе с жёстко заданными правилами.
            </p>
          </div>
        </section>

        {/* Поддерживаемые типы работ */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Поддерживаемые типы работ
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { name: "Дипломные работы", href: "/diplom" },
              { name: "Курсовые работы", href: "/kursovaya" },
              { name: "Рефераты", href: "/referat" },
              { name: "Эссе", href: "/esse" },
              { name: "Отчеты по практике", href: "/otchet-po-praktike" },
              { name: "Научные статьи", href: "/create" },
            ].map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className="bg-surface rounded-xl border border-surface-border p-4 text-center hover:bg-surface-hover hover:border-violet-500/30 transition-colors group"
              >
                <span className="text-on-surface group-hover:text-foreground transition-colors">
                  {item.name}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 rounded-2xl border border-violet-500/20 p-8">
            <Clock className="w-8 h-8 text-violet-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Готовы попробовать?
            </h2>
            <p className="text-on-surface-muted mb-6">
              Первый документ форматируется бесплатно — оцените качество без
              рисков
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
                href="/faq"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-surface-hover text-foreground font-medium hover:bg-surface-hover transition-colors"
              >
                Частые вопросы
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
