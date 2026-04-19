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
  ArrowRight,
  FileText,
  Clock,
  Zap,
  BookOpen,
  MessageSquare,
  Heart,
  RefreshCw,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Научрук вернул с правками — пошаговый план что делать",
  description:
    "Научный руководитель снова вернул работу? 5 типов правок научрука и как с ними справиться. Как сохранить нервы и не опустить руки. Diplox оформляет правки по методичке автоматически.",
  keywords: [
    "научный руководитель правки",
    "научрук вернул работу",
    "правки научрука",
    "как общаться с научруком",
    "научный руководитель замечания",
    "что делать если научрук вернул диплом",
    "правки к дипломной работе",
    "как реагировать на правки научрука",
    "отношения с научным руководителем",
  ],
  alternates: {
    canonical: `${SITE_URL}/nauchnik`,
  },
};

const howToSteps = [
  {
    name: "Прочитай все замечания спокойно, не сразу отвечай",
    text: "Получил список правок — сначала прочитай всё целиком, не пиши ответ научруку в тот же момент. Дай себе 30 минут. Первая реакция почти всегда сильнее, чем сам объём работы.",
  },
  {
    name: "Раздели замечания на типы",
    text: "Пройдись по каждому пункту и отметь: это правка содержания (надо думать), правка структуры (надо переставить), правка оформления (надо переделать технически), или пожелание стиля (надо перефразировать). Каждый тип решается по-своему.",
  },
  {
    name: "Начни с быстрых правок оформления",
    text: "Технические правки (поля, шрифт, нумерация, список литературы) — самые быстрые. Загрузи документ в Diplox с методичкой, система применит требования автоматически. Это займёт 4 минуты и снимет часть замечаний сразу.",
  },
  {
    name: "Смысловые правки — блоками, с черновиком",
    text: "Не пытайся переписать всё сразу. Возьми одну главу или один параграф — напиши черновик, дай отлежаться час, вернись и отшлифуй. Инструмент /rewrite поможет перефразировать проблемные места.",
  },
  {
    name: "Фиксируй все изменения в отдельном документе",
    text: "Создай таблицу: замечание → что сделал → страница. Это покажет научруку, что ты всё учёл, и упростит следующую проверку. Часть научруков требует такой таблицы явно.",
  },
  {
    name: "Отправляй новую версию с кратким сопроводительным письмом",
    text: "«Прикрепляю доработанную версию. Все замечания учтены — список правок во вложении.» Покажи, что работаешь ответственно. Научруки ценят конкретику, а не «исправил всё».",
  },
];

const revisionTypes = [
  {
    type: "Структурные правки",
    description:
      "«Переставь параграфы», «введение не соответствует выводам», «методология должна быть до результатов».",
    emotion: "раздражение",
    advice:
      "Набросай схему новой структуры на бумаге до того, как открывать Word. Визуально понятнее. Потом переставляй блоки.",
    icon: RefreshCw,
  },
  {
    type: "Содержательные правки",
    description:
      "«Недостаточно источников», «анализ поверхностный», «нет связи с практикой».",
    emotion: "растерянность",
    advice:
      "Попроси научрука уточнить, какие конкретно разделы кажутся поверхностными — общие замечания трудно исправить. Используй /sources для подбора новых источников.",
    icon: BookOpen,
  },
  {
    type: "Стилистические правки",
    description:
      "«Слишком разговорный стиль», «много личных местоимений», «не академический язык».",
    emotion: "обида",
    advice:
      "Используй инструмент /rewrite в Diplox для перефразирования в академический стиль — три уровня глубины, сохраняет смысл.",
    icon: MessageSquare,
  },
  {
    type: "Правки оформления",
    description:
      "«Не по методичке», «список литературы неверный», «заголовки не совпадают».",
    emotion: "усталость",
    advice:
      "Это самые простые правки технически. Загрузи в Diplox с методичкой — система применит все требования за 4 минуты, без ручной правки каждой строчки.",
    icon: FileText,
  },
  {
    type: "Личные замечания научрука",
    description:
      "«Ты написал это неправильно», «я ожидал другого подхода», «это не то, что мы обсуждали».",
    emotion: "беспомощность",
    advice:
      "Попроси очную встречу или видеозвонок. Часто такие замечания означают просто расхождение ожиданий — проще выяснить за 20 минут вживую, чем через почту.",
    icon: Heart,
  },
];

const faqs = [
  {
    question: "Научрук вернул работу с правками — с чего начать?",
    answer:
      "Первый шаг — прочитай все замечания спокойно, не отвечай сразу. Раздели правки на типы: оформление, содержание, стиль, структура. Начни с оформления — это самое быстрое: загрузи в Diplox с методичкой и получи технически правильный документ. Потом работай с содержательными правками по одному блоку.",
  },
  {
    question: "Сколько раз нормально возвращать работу на правки?",
    answer:
      "У каждого научрука своя планка — кто-то даёт 1-2 итерации, кто-то проводит через 5-6 кругов. В среднем 2-3 итерации до финального одобрения — это норма. Важно: при каждой правке фиксируй, что изменил, и прикладывай список изменений. Это ускоряет следующую проверку.",
  },
  {
    question: "Как общаться с научным руководителем, если он долго не отвечает?",
    answer:
      "Напоминание через неделю — норма, через 10 дней — обязанность. Пиши коротко: «Прикрепил доработанную версию [дата], жду обратной связи — когда удобно встретиться?» Если долго молчит — обратись к куратору группы или на кафедру. Это не конфликт, это рабочий процесс.",
  },
  {
    question: "Что делать, если замечания научрука противоречат методичке?",
    answer:
      "Это случается. Уточни у научрука устно, какие требования приоритетны. Если противоречие серьёзное — можно мягко упомянуть, что в методичке написано иначе, и спросить, как поступить. Часто научруки не помнят актуальную редакцию методических указаний. Показывай конкретный пункт методички.",
  },
  {
    question: "Может ли Diplox помочь с правками научрука?",
    answer:
      "Да, с технической частью. Если научрук вернул работу из-за оформления (поля, шрифт, список литературы, оглавление) — загрузи в Diplox, система применит требования методички автоматически. Для смысловых правок — инструмент /rewrite поможет переформулировать проблемные абзацы, /sources — найти новые источники, /grammar — проверить грамматику и пунктуацию.",
  },
  {
    question: "Как не опустить руки, когда правок очень много?",
    answer:
      "Декомпозируй: не «сделать все правки», а «сегодня — только оформление». Оформление — в Diplox (4 минуты). Завтра — только введение. Послезавтра — один раздел. Прогресс по маленьким кускам психологически работает лучше, чем смотреть на гору замечаний целиком. И помни: «нервы» и «руки опускаются» — это норма перед защитой, не признак провала.",
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Научрук вернул работу с правками: пошаговый план и как сохранить нервы",
  description:
    "5 типов правок научного руководителя, как с ними справляться и как Diplox помогает с повторными итерациями оформления.",
  url: `${SITE_URL}/nauchnik`,
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

export default function NauchnikPage() {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      {/* JSON-LD Schemas */}
      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "Правки научрука", url: "/nauchnik" },
        ])}
      />
      <JsonLd
        data={getHowToSchema(
          "Что делать, когда научрук вернул работу с правками",
          "Пошаговый план действий после получения замечаний от научного руководителя",
          howToSteps
        )}
      />
      <JsonLd data={getFAQPageSchema(faqs)} />
      <JsonLd data={articleSchema} />

      <main className="mx-auto max-w-4xl px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted border border-border text-primary text-sm mb-6">
            <MessageSquare className="w-4 h-4" />
            Правки научрука
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Научрук вернул работу с правками —
            <br />
            пошаговый план что делать
          </h1>
          <p className="text-on-surface-muted text-lg max-w-2xl mx-auto">
            «У меня был очень вредный дипломный руководитель — из-за чего я
            множество раз отправлял работу в корректировку.» Ты не один.
            Разбираем, как выйти из этого круга.
          </p>
        </div>

        {/* TL;DR callout */}
        <div className="bg-surface border border-surface-border p-6 mb-12">
          <div className="flex items-start gap-3 mb-4">
            <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <h2 className="font-semibold text-foreground text-base">
              Коротко: что делать прямо сейчас
            </h2>
          </div>
          <ul className="space-y-2 text-on-surface-muted text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Раздели замечания на 5 типов: структурные, содержательные,
                стилистические, оформительские, личные. Каждый решается
                по-своему.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Начни с оформления — это самое быстрое. Diplox применит
                требования методички автоматически за 4 минуты.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Смысловые правки — блоками, по одному разделу в день. Не
                пытайся переписать всё сразу.
              </span>
            </li>
          </ul>
        </div>

        {/* 5 типов правок */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-muted flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              5 типов правок научрука и что с ними делать
            </h2>
          </div>

          <div className="space-y-4">
            {revisionTypes.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={index}
                  className="bg-surface border border-surface-border p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3 className="font-medium text-foreground">
                          {item.type}
                        </h3>
                        <span className="text-xs text-on-surface-subtle bg-muted px-2 py-0.5 rounded">
                          чувство: {item.emotion}
                        </span>
                      </div>
                      <p className="text-on-surface-muted text-sm mb-3 italic">
                        {item.description}
                      </p>
                      <div className="flex items-start gap-2 bg-muted/50 rounded px-3 py-2">
                        <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-sm text-on-surface-muted">
                          {item.advice}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Как сохранить нервы */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-muted flex items-center justify-center">
              <Heart className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Как сохранить нервы в процессе правок
            </h2>
          </div>

          <div className="bg-surface border border-surface-border p-6 mb-6">
            <p className="text-on-surface-muted leading-relaxed mb-4">
              «Сохранили мне кучу времени и нервов» — так студенты говорят о
              моменте, когда оформление перестало быть проблемой. Нервы в
              основном уходят на повторные технические итерации: вернули —
              переделал вручную — снова вернули из-за той же мелочи.
            </p>
            <p className="text-on-surface-muted leading-relaxed mb-4">
              Три вещи, которые реально помогают: во-первых, убери техническую
              часть из уравнения (Diplox делает это за 4 минуты). Во-вторых,
              декомпозируй — не «сделать все правки», а «сегодня — только один
              раздел». В-третьих, фиксируй прогресс: список исправленных пунктов
              видишь — меньше ощущения, что работаешь вхолостую.
            </p>
            <p className="text-on-surface-muted leading-relaxed">
              «Руки опускаются» — это сигнал взять паузу на 30 минут, а не
              признак провала. Большинство студентов, которые получают диплом,
              прошли через тот же круг правок. Это нормальная часть процесса.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-surface border border-surface-border p-5">
              <Clock className="w-6 h-6 text-primary mb-3" />
              <h3 className="font-medium text-foreground mb-2 text-sm">
                Один блок в день
              </h3>
              <p className="text-on-surface-muted text-sm">
                Психологически работает лучше, чем смотреть на список замечаний
                целиком. Прогресс заметен — мотивация держится.
              </p>
            </div>
            <div className="bg-surface border border-surface-border p-5">
              <CheckCircle className="w-6 h-6 text-primary mb-3" />
              <h3 className="font-medium text-foreground mb-2 text-sm">
                Таблица изменений
              </h3>
              <p className="text-on-surface-muted text-sm">
                Создай документ: замечание → что сделал → страница. Прикладывай
                к каждой правке. Ускоряет следующую проверку научрука.
              </p>
            </div>
          </div>
        </section>

        {/* Пошаговый план */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-muted flex items-center justify-center">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Пошаговый план работы с правками
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

        {/* Как Diplox помогает с повторными итерациями */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-muted flex items-center justify-center">
              <Zap className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Как Diplox помогает с повторными итерациями оформления
            </h2>
          </div>

          <div className="bg-surface border border-surface-border p-6 mb-6">
            <p className="text-on-surface-muted leading-relaxed mb-4">
              Каждый раз, когда научрук возвращает работу из-за оформления —
              это повторный круг ручной правки. Diplox убирает этот круг: загрузи
              .docx и методичку, получи готовый файл с правильными полями,
              шрифтом, интервалами, заголовками и списком литературы.
            </p>
            <p className="text-on-surface-muted leading-relaxed">
              Если у тебя нет методички — Diplox работает по ГОСТ 7.32-2017.
              Это снимает большинство оформительских замечаний с первого раза.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              href="/rewrite"
              className="flex items-center justify-between bg-surface border border-surface-border p-5 hover:bg-surface-hover transition-colors group"
            >
              <div>
                <div className="font-medium text-foreground mb-1">
                  Перефразирование
                </div>
                <div className="text-on-surface-muted text-sm">
                  Переписать абзацы в академический стиль
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </Link>
            <Link
              href="/create"
              className="flex items-center justify-between bg-surface border border-surface-border p-5 hover:bg-surface-hover transition-colors group"
            >
              <div>
                <div className="font-medium text-foreground mb-1">
                  Автоформатирование
                </div>
                <div className="text-on-surface-muted text-sm">
                  Применить требования методички автоматически
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
              Частые вопросы про правки научрука
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
            <RefreshCw className="w-8 h-8 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Убери оформление из круга правок
            </h2>
            <p className="text-on-surface-muted mb-6">
              Первый документ — бесплатно. Ты написал — мы оформим.
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
                href="/rewrite"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-surface-hover text-foreground font-medium hover:bg-surface-hover transition-colors border border-surface-border"
              >
                Перефразировать текст
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
