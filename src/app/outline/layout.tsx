import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Генератор плана работы — структура курсовой и диплома | SmartFormat",
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
    canonical: "https://sformat.online/outline",
  },
  openGraph: {
    title: "Генератор плана работы — SmartFormat",
    description:
      "Создайте структуру курсовой или дипломной работы с помощью ИИ. Разделы, подразделы и рекомендуемый объём.",
    url: "https://sformat.online/outline",
  },
};

export default function OutlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
