import { Metadata } from "next";
import { JsonLd, MultiJsonLd } from "@/components/JsonLd";
import {
  getBreadcrumbSchema,
  getFAQPageSchema,
  getPricingSchemas,
} from "@/lib/seo/schemas";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Тарифы Diplox — форматирование по ГОСТу от 0 ₽",
  description:
    "Пробный тариф бесплатно (1 документ, 30 страниц). Разовая обработка — 159 ₽. Pro подписка — 399 ₽/мес (10 документов, все инструменты). Без привязки карты.",
  keywords: [
    "цена форматирования диплома",
    "стоимость оформления курсовой",
    "тарифы Diplox",
    "форматирование по ГОСТу цена",
    "оформление научной работы стоимость",
  ],
  alternates: {
    canonical: `${SITE_URL}/pricing`,
  },
  openGraph: {
    title: "Тарифы Diplox — оформление работ по ГОСТу",
    description:
      "Пробный период бесплатно. Разовая обработка — 159₽. Pro подписка — 399₽/месяц.",
    url: `${SITE_URL}/pricing`,
  },
};

const paymentFAQ = [
  {
    question: "Какие способы оплаты доступны?",
    answer:
      "Принимаем банковские карты (Visa, MasterCard, МИР), а также оплату через СБП и электронные кошельки.",
  },
  {
    question: "Как работает пробный период?",
    answer:
      "Первый документ обрабатывается бесплатно без привязки карты. Вы сможете оценить качество форматирования перед покупкой.",
  },
  {
    question: "Можно ли отменить подписку?",
    answer:
      "Да, подписку можно отменить в любой момент. Доступ сохранится до конца оплаченного периода.",
  },
];

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "Тарифы", url: "/pricing" },
        ])}
      />
      <JsonLd data={getFAQPageSchema(paymentFAQ)} />
      <MultiJsonLd schemas={getPricingSchemas()} />
      {children}
    </>
  );
}
