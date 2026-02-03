import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Тарифы — форматирование научных работ по ГОСТу",
  description:
    "Выберите подходящий тариф для форматирования диплома, курсовой или реферата. Пробный период бесплатно, разовая обработка от 159₽, безлимит — 399₽/месяц.",
  keywords: [
    "цена форматирования диплома",
    "стоимость оформления курсовой",
    "тарифы SmartFormat",
    "форматирование по ГОСТу цена",
    "оформление научной работы стоимость",
  ],
  alternates: {
    canonical: "https://ai-sformat.vercel.app/pricing",
  },
  openGraph: {
    title: "Тарифы SmartFormat — оформление работ по ГОСТу",
    description:
      "Пробный период бесплатно. Разовая обработка — 159₽. Безлимитная подписка — 399₽/месяц.",
    url: "https://ai-sformat.vercel.app/pricing",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
