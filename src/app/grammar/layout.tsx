import { Metadata } from "next";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Проверка грамматики онлайн — Diplox",
  description:
    "Бесплатная онлайн-проверка текста на грамматические, орфографические и пунктуационные ошибки. Загрузите текст или файл — получите подробный отчёт с исправлениями.",
  keywords: [
    "проверка грамматики онлайн",
    "проверка орфографии текста",
    "проверка пунктуации",
    "исправление ошибок в тексте",
    "грамматические ошибки",
    "проверка текста бесплатно",
    "проверка стилистики текста",
  ],
  alternates: {
    canonical: `${SITE_URL}/grammar`,
  },
  openGraph: {
    title: "Проверка грамматики онлайн — Diplox",
    description:
      "Проверьте текст на орфографические, пунктуационные и стилистические ошибки. Подробный отчёт с вариантами исправления.",
    url: `${SITE_URL}/grammar`,
  },
};

export default function GrammarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
