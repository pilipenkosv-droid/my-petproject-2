import { Metadata } from "next";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Краткое содержание текста — аннотация с помощью ИИ | Diplox",
  description:
    "Создайте краткое содержание или пересказ научной работы с помощью ИИ. Сократите текст до нужного объёма — три длины резюме: короткое, среднее, подробное.",
  keywords: [
    "краткое содержание текста",
    "сократить текст онлайн",
    "пересказ текста онлайн",
    "как написать аннотацию",
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
