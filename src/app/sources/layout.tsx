import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Подбор литературы для научной работы — SmartFormat",
  description:
    "Подберите научные источники по теме вашей работы. Поиск по базам OpenAlex и CrossRef — реальные статьи, книги и публикации с оформлением по ГОСТу.",
  keywords: [
    "подбор литературы",
    "поиск научных источников",
    "список литературы по теме",
    "научные статьи поиск",
    "ГОСТ 7.1 список литературы",
    "источники для курсовой",
    "литература для диплома",
  ],
  alternates: {
    canonical: "https://sformat.online/sources",
  },
  openGraph: {
    title: "Подбор литературы для научной работы — SmartFormat",
    description:
      "Найдите реальные научные источники по теме работы. Поиск по OpenAlex и CrossRef с оформлением по ГОСТу.",
    url: "https://sformat.online/sources",
  },
};

export default function SourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
