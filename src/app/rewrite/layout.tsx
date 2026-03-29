import { Metadata } from "next";
import { SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Перефразировать текст онлайн — рерайт и уникальность | Diplox",
  description:
    "Перефразируйте или перепишите текст онлайн — три режима глубины рерайта для повышения уникальности. Загрузите текст или файл, получите результат с сохранением смысла.",
  keywords: [
    "перефразировать текст",
    "переписать текст онлайн",
    "рерайт онлайн бесплатно",
    "рерайт онлайн",
    "повысить антиплагиат",
    "повысить уникальность текста",
    "уникальность текста онлайн",
    "антиплагиат уникальность",
    "уникальность курсовой",
  ],
  alternates: {
    canonical: `${SITE_URL}/rewrite`,
  },
  openGraph: {
    title: "Перефразировать текст онлайн — Diplox",
    description:
      "Перефразируйте текст с сохранением смысла для повышения уникальности. Три режима глубины рерайта.",
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
