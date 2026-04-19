import { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import {
  getBreadcrumbSchema,
  getHowToSchema,
  getFAQPageSchema,
} from "@/lib/seo/schemas";
import { SITE_URL } from "@/lib/config/site";
import {
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  FileText,
  Clock,
  Zap,
  BookOpen,
  Target,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Нормоконтроль дипломной работы — как пройти с первого раза",
  description:
    "Что такое нормоконтроль, почему работы возвращают и как избежать повторных правок. 7 частых ошибок оформления и чеклист проверки перед сдачей. Diplox оформляет по методичке вуза автоматически.",
  keywords: [
    "нормоконтроль",
    "как пройти нормоконтроль",
    "ошибки нормоконтроля",
    "нормоконтроль дипломной работы",
    "нормоконтроль курсовой",
    "что проверяют на нормоконтроле",
    "нормоконтроль с первого раза",
    "требования нормоконтроля",
    "замечания нормоконтроля",
  ],
  alternates: {
    canonical: `${SITE_URL}/normokontrol`,
  },
};

const howToSteps = [
  {
    name: "Прочитай методичку вуза",
    text: "Найди актуальные методические указания своей кафедры — именно по ним проверяют нормоконтролёр. Общий ГОСТ 7.32 — лишь база, методичка может отличаться.",
  },
  {
    name: "Проверь оформление шрифта и отступов",
    text: "Times New Roman 14pt, интервал 1.5, отступы полей: левое 30 мм, правое 10 мм, верхнее и нижнее 20 мм — наиболее типичные требования, но сверь с методичкой.",
  },
  {
    name: "Проверь заголовки и содержание",
    text: "Все заголовки глав и параграфов должны точно совпадать с содержанием (оглавлением). Нумерация страниц — сверху или снизу посередине, без точки.",
  },
  {
    name: "Оформи список литературы по ГОСТ",
    text: "Источники — в алфавитном порядке, с полными данными (автор, год, издание, страницы). ГОСТ 7.1-2003 или ГОСТ Р 7.0.100-2018 — уточни в методичке.",
  },
  {
    name: "Проверь рисунки и таблицы",
    text: "Каждый рисунок подписан снизу, каждая таблица — сверху, все элементы пронумерованы и упомянуты в тексте до того, как они появляются.",
  },
  {
    name: "Проверь ссылки на источники в тексте",
    text: "Ссылки в квадратных скобках [1, с. 15] или [1] должны совпадать с номерами в списке литературы. Ни одного источника без ссылки в тексте.",
  },
  {
    name: "Загрузи в Diplox для автоформатирования",
    text: "Загрузи .docx и методичку — Diplox применит все требования автоматически за 4 минуты. Вероятность пройти нормоконтроль с первого раза резко возрастает.",
  },
];

const commonErrors = [
  {
    error: "Шрифт или размер не тот",
    description:
      "Используется Arial вместо Times New Roman, или 12pt вместо 14pt. Нормоконтролёр видит это с первого взгляда.",
    fix: "Выдели всё (Ctrl+A) и примени нужный шрифт из методички.",
  },
  {
    error: "Поля не совпадают с методичкой",
    description:
      "Стандартный Word открывается с полями 2-2-2-2 см, а методичка часто требует 3-1-2-2.",
    fix: "Разметка → Поля → Настраиваемые поля. Или Diplox сделает это автоматически.",
  },
  {
    error: "Заголовки в содержании не совпадают с текстом",
    description:
      "Поправил заголовок в тексте, но забыл обновить оглавление — одна из самых частых причин возврата.",
    fix: "Нажми ПКМ по оглавлению → Обновить поле → Обновить всё оглавление.",
  },
  {
    error: "Рисунки без подписей или не упомянуты в тексте",
    description:
      "По ГОСТ каждый рисунок должен быть упомянут в тексте до его появления: «как показано на рисунке 1».",
    fix: "Пройдись по каждому рисунку: есть подпись снизу? Есть ссылка в тексте выше?",
  },
  {
    error: "Список литературы оформлен не по ГОСТ",
    description:
      "Пропущен год издания, город, издательство, количество страниц — каждый из этих элементов может быть замечанием.",
    fix: "Используй инструмент /sources в Diplox для автоматического оформления ссылок.",
  },
  {
    error: "Нумерация страниц начинается с титульного листа",
    description:
      "Титульный лист входит в нумерацию, но на нём номер не ставится. Фактическая нумерация начинается со второй страницы.",
    fix: "Вставка → Номер страницы → Другие форматы → Начать с: 1, снять «Отображать на первой странице».",
  },
  {
    error: "Ссылки в тексте не совпадают со списком литературы",
    description:
      "Источник [7] в тексте, а в списке литературы только 6 позиций. Или ссылка есть, но источник не внесён в список.",
    fix: "Пройдись по каждой ссылке в тексте и убедись, что соответствующий номер есть в списке литературы.",
  },
];

const faqs = [
  {
    question: "Что такое нормоконтроль и кто его проводит?",
    answer:
      "Нормоконтроль — обязательная проверка дипломной или курсовой работы на соответствие требованиям оформления (ГОСТ и методичка вуза) перед допуском к защите. Проводит его специально назначенный сотрудник кафедры или деканата — нормоконтролёр. Проверяет шрифт, отступы, заголовки, список литературы, оформление рисунков и таблиц.",
  },
  {
    question: "Сколько раз можно пересдавать нормоконтроль?",
    answer:
      "Официально — неограниченное количество раз, пока не пройдёшь. На практике каждая пересдача отнимает 2–5 дней (пока нормоконтролёр доступен и рассмотрит работу). Если нормоконтроль не пройден за неделю до защиты — могут перенести защиту. Именно поэтому важно пройти с первого раза.",
  },
  {
    question: "Что делать, если работу вернули с нормоконтроля?",
    answer:
      "Не паникуй. Возьми лист замечаний и исправляй по каждому пункту. Типичные замечания: неверные поля, шрифт, отступы, оглавление не совпадает с текстом. Самый быстрый способ — загрузить работу в Diplox с методичкой вуза: система применит все требования автоматически, и при повторной сдаче вероятность прохождения значительно выше.",
  },
  {
    question: "Нормоконтроль — это то же самое, что проверка на плагиат?",
    answer:
      "Нет. Нормоконтроль проверяет только оформление: соответствие ГОСТу, шрифты, отступы, заголовки, список литературы. Антиплагиат (Антиплагиат.ру, Руконтекст) проверяет уникальность текста — это разные этапы. Обычно сначала проверяют на антиплагиат, потом проходят нормоконтроль.",
  },
  {
    question: "Помогает ли Diplox пройти нормоконтроль?",
    answer:
      "Да. Diplox анализирует твою методичку (или общий ГОСТ 7.32) и применяет все требования оформления к документу автоматически: поля, шрифт, межстрочный интервал, отступы, заголовки, нумерацию страниц. Это не гарантия прохождения нормоконтроля на 100% (содержание проверяет сам нормоконтролёр), но устраняет 90% технических ошибок оформления.",
  },
  {
    question: "Проверяют ли на нормоконтроле содержание работы?",
    answer:
      "Формально нет — нормоконтролёр проверяет только оформление, не содержание. Но если видит явные ошибки в структуре (нет введения, заключения, неправильно оформлены приложения) — вернёт на доработку. Содержание проверяет научный руководитель, а соответствие требованиям к теме — комиссия на защите.",
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Нормоконтроль дипломной работы: как пройти с первого раза и не получить замечания",
  description:
    "Разбираем, что такое нормоконтроль, какие 7 ошибок оформления встречаются чаще всего и как Diplox помогает устранить их автоматически.",
  url: `${SITE_URL}/normokontrol`,
  datePublished: "2026-04-19",
  dateModified: "2026-04-19",
  image: {
    "@type": "ImageObject",
    url: `${SITE_URL}/og-image.png`,
    width: 1792,
    height: 1024,
  },
  author: {
    "@type": "Person",
    name: "Сергей Пилипенко",
    jobTitle: "Founder & Developer, Diplox",
    url: `${SITE_URL}/about`,
  },
  publisher: {
    "@type": "Organization",
    name: "Diplox",
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/logo/d-icon-full.png`,
      width: 512,
      height: 512,
    },
  },
  inLanguage: "ru-RU",
};

export default function NormokontrolPage() {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      {/* JSON-LD Schemas */}
      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "Нормоконтроль", url: "/normokontrol" },
        ])}
      />
      <JsonLd
        data={getHowToSchema(
          "Как пройти нормоконтроль с первого раза",
          "Пошаговая инструкция по подготовке дипломной или курсовой работы к нормоконтролю",
          howToSteps
        )}
      />
      <JsonLd data={getFAQPageSchema(faqs)} />
      <JsonLd data={articleSchema} />

      <main className="mx-auto max-w-4xl px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted border border-border text-primary text-sm mb-6">
            <Target className="w-4 h-4" />
            Нормоконтроль
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Нормоконтроль дипломной работы:
            <br />
            как пройти с первого раза
          </h1>
          <p className="text-on-surface-muted text-lg max-w-2xl mx-auto">
            Снова вернули? Мы знаем это чувство. 9 из 10 замечаний
            нормоконтролёра — технические ошибки оформления, которые
            устраняются автоматически.
          </p>
        </div>

        {/* TL;DR callout — первый блок по правилам GEO */}
        <div className="bg-surface border border-surface-border p-6 mb-12">
          <div className="flex items-start gap-3 mb-4">
            <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <h2 className="font-semibold text-foreground text-base">
              Коротко: что важно знать прямо сейчас
            </h2>
          </div>
          <ul className="space-y-2 text-on-surface-muted text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Нормоконтроль проверяет только оформление — шрифт, поля,
                заголовки, список литературы, рисунки. Содержание смотрит
                научрук.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                7 ошибок встречаются в 80% работ: неверные поля, шрифт,
                несовпадение оглавления, рисунки без подписей, неправильный
                список литературы.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Diplox применяет требования методички вуза автоматически за 4
                минуты — загрузи .docx и получи отформатированный файл.
              </span>
            </li>
          </ul>
        </div>

        {/* Секция типичных замечаний */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-muted flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              7 частых ошибок нормоконтроля
            </h2>
          </div>
          <p className="text-on-surface-muted mb-6">
            «Автор не учёл рекомендации, предоставленные мной (методичка). Из-за
            чего работа несколько раз возвращалась с нормоконтроля» — типичный
            отзыв студента. Ниже — конкретные ошибки и как их исправить.
          </p>

          <div className="space-y-4">
            {commonErrors.map((item, index) => (
              <div
                key={index}
                className="bg-surface border border-surface-border p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-muted flex items-center justify-center text-muted-foreground font-semibold shrink-0 text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground mb-1">
                      {item.error}
                    </h3>
                    <p className="text-on-surface-muted text-sm mb-3">
                      {item.description}
                    </p>
                    <div className="flex items-start gap-2 bg-muted/50 rounded px-3 py-2">
                      <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm text-on-surface-muted">
                        {item.fix}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Чеклист — как пройти HowTo */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-muted flex items-center justify-center">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Пошаговый план: как пройти нормоконтроль
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {howToSteps.map((step, index) => (
              <div
                key={index}
                className="bg-surface border border-surface-border p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-muted flex items-center justify-center text-muted-foreground font-semibold shrink-0 text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground mb-1 text-sm">
                      {step.name}
                    </h3>
                    <p className="text-on-surface-muted text-xs">{step.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Как Diplox помогает */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-muted flex items-center justify-center">
              <Zap className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Как Diplox помогает пройти нормоконтроль
            </h2>
          </div>

          <div className="bg-surface border border-surface-border p-6 mb-6">
            <p className="text-on-surface-muted leading-relaxed mb-4">
              Загрузи работу в формате .docx и методичку своего вуза — Diplox
              проанализирует требования и применит их автоматически: шрифт,
              поля, межстрочный интервал, отступы абзаца, оформление заголовков,
              нумерацию страниц.
            </p>
            <p className="text-on-surface-muted leading-relaxed">
              Если методички нет — работает по ГОСТ 7.32-2017 (стандартный
              формат для большинства вузов). На выходе — готовый .docx файл,
              который технически соответствует требованиям нормоконтроля.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-surface border border-surface-border p-5 text-center">
              <Clock className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="font-bold text-foreground text-lg mb-1">
                4 мин
              </div>
              <div className="text-on-surface-muted text-sm">
                среднее время обработки документа
              </div>
            </div>
            <div className="bg-surface border border-surface-border p-5 text-center">
              <CheckCircle className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="font-bold text-foreground text-lg mb-1">90%</div>
              <div className="text-on-surface-muted text-sm">
                технических ошибок устраняется автоматически
              </div>
            </div>
            <div className="bg-surface border border-surface-border p-5 text-center">
              <FileText className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="font-bold text-foreground text-lg mb-1">0 ₽</div>
              <div className="text-on-surface-muted text-sm">
                первый документ — бесплатно
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              href="/create"
              className="flex items-center justify-between bg-surface border border-surface-border p-5 hover:bg-surface-hover transition-colors group"
            >
              <div>
                <div className="font-medium text-foreground mb-1">
                  Автоформатирование
                </div>
                <div className="text-on-surface-muted text-sm">
                  Загрузи .docx + методичку, получи готовый файл
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </Link>
            <Link
              href="/diplom"
              className="flex items-center justify-between bg-surface border border-surface-border p-5 hover:bg-surface-hover transition-colors group"
            >
              <div>
                <div className="font-medium text-foreground mb-1">
                  Дипломная работа
                </div>
                <div className="text-on-surface-muted text-sm">
                  Оформление диплома по ГОСТу и методичке вуза
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-muted flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Частые вопросы про нормоконтроль
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-surface border border-surface-border p-6"
              >
                <h3 className="font-medium text-foreground mb-3">
                  {faq.question}
                </h3>
                <p className="text-on-surface-muted text-sm leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <div className="bg-muted rounded-2xl border border-border p-8">
            <CheckCircle className="w-8 h-8 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Сдай нормоконтроль с первого раза
            </h2>
            <p className="text-on-surface-muted mb-6">
              Первый документ — бесплатно. Не надо снова переделывать вручную.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/create"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
              >
                Оформить сейчас — бесплатно
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/diplom"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-surface-hover text-foreground font-medium hover:bg-surface-hover transition-colors border border-surface-border"
              >
                Про оформление диплома
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
