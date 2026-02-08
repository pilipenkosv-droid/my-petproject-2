import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Проверка грамматики онлайн — SmartFormat",
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
    canonical: "https://ai-sformat.vercel.app/grammar",
  },
  openGraph: {
    title: "Проверка грамматики онлайн — SmartFormat",
    description:
      "Проверьте текст на орфографические, пунктуационные и стилистические ошибки. Подробный отчёт с вариантами исправления.",
    url: "https://ai-sformat.vercel.app/grammar",
  },
};

export default function GrammarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
