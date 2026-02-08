import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Повышение уникальности текста — рерайт онлайн | SmartFormat",
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
    canonical: "https://sformat.online/rewrite",
  },
  openGraph: {
    title: "Повышение уникальности текста — SmartFormat",
    description:
      "Перепишите текст с сохранением смысла для повышения уникальности. Три режима глубины рерайта.",
    url: "https://sformat.online/rewrite",
  },
};

export default function RewriteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
