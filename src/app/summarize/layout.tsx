import { Metadata } from "next";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Краткое содержание текста — аннотация с помощью ИИ | Diplox",
  description:
    "Создайте аннотацию или краткое содержание научной работы с помощью ИИ. Три длины резюме: короткое, среднее, подробное. Загрузите текст или файл.",
  keywords: [
    "краткое содержание текста",
    "аннотация к работе",
    "резюмирование текста",
    "AI краткое содержание",
    "автоматическая аннотация",
    "аннотация к курсовой",
    "аннотация к диплому",
  ],
  alternates: {
    canonical: `${SITE_URL}/summarize`,
  },
  openGraph: {
    title: "Краткое содержание текста — Diplox",
    description:
      "Создайте аннотацию к научной работе с помощью ИИ. Короткое, среднее или подробное резюме.",
    url: `${SITE_URL}/summarize`,
  },
};

export default function SummarizeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
