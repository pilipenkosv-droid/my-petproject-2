import { Metadata } from "next";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Загрузить работу для форматирования — Diplox",
  description:
    "Загрузите работу в .docx и методичку — ИИ автоматически оформит документ по ГОСТу и требованиям вашего вуза за несколько минут.",
  alternates: {
    canonical: `${SITE_URL}/create`,
  },
  openGraph: {
    title: "Загрузить работу для форматирования — Diplox",
    description:
      "Загрузите работу и методичку — ИИ автоматически оформит документ по ГОСТу и требованиям вуза.",
    url: `${SITE_URL}/create`,
  },
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
