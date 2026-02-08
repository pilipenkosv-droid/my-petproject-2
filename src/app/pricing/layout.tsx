import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Тарифы — форматирование научных работ по ГОСТу",
  description:
    "Выберите тариф для форматирования научных работ, проверки грамматики, подбора литературы и других AI-инструментов. Пробный период бесплатно, от 159₽ за документ.",
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
