import { Metadata } from "next";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Повышение уникальности текста — рерайт онлайн | Diplox",
  description:
    "Повысьте уникальность текста с сохранением смысла. Три режима глубины рерайта: лёгкий, средний, глубокий. Загрузите текст или файл — получите уникальный результат.",
  keywords: [
    "повысить уникальность текста",
    "рерайт онлайн",
    "переписать текст",
    "антиплагиат уникальность",
    "перефразировать текст",
    "уникальность курсовой",
    "повышение оригинальности",
  ],
  alternates: {
    canonical: `${SITE_URL}/rewrite`,
  },
  openGraph: {
    title: "Повышение уникальности текста — Diplox",
    description:
      "Перепишите текст с сохранением смысла для повышения уникальности. Три режима глубины рерайта.",
    url: `${SITE_URL}/rewrite`,
  },
};

export default function RewriteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
