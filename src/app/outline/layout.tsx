import { Metadata } from "next";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Генератор плана работы — структура курсовой и диплома | Diplox",
  description:
    "Создайте план курсовой или дипломной работы с помощью ИИ. Автоматическая генерация структуры с разделами, подразделами и рекомендуемым объёмом.",
  keywords: [
    "план курсовой работы",
    "план дипломной работы",
    "генератор плана",
    "структура работы",
    "содержание курсовой",
    "план ВКР",
    "оглавление диплома",
  ],
  alternates: {
    canonical: `${SITE_URL}/outline`,
  },
  openGraph: {
    title: "Генератор плана работы — Diplox",
    description:
      "Создайте структуру курсовой или дипломной работы с помощью ИИ. Разделы, подразделы и рекомендуемый объём.",
    url: `${SITE_URL}/outline`,
  },
};

export default function OutlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
