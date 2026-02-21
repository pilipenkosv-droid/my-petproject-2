import { Metadata } from "next";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Тарифы — форматирование научных работ по ГОСТу",
  description:
    "Выберите тариф для форматирования научных работ, проверки грамматики, подбора литературы и других AI-инструментов. Пробный период бесплатно, от 159₽ за документ.",
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
      "Пробный период бесплатно. Разовая обработка — 159₽. Безлимитная подписка — 399₽/месяц.",
    url: `${SITE_URL}/pricing`,
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
