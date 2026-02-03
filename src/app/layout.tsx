import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { JsonLd } from "@/components/JsonLd";
import { getSoftwareApplicationSchema, getWebSiteSchema } from "@/lib/seo/schemas";
import "./globals.css";

const BASE_URL = "https://ai-sformat.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "SmartFormat — Автоматическое форматирование научных работ по методичке онлайн",
    template: "%s | SmartFormat",
  },
  description:
    "Загрузите работу в .docx и методичку — ИИ-сервис автоматически оформит текст по ГОСТу и требованиям вуза за несколько минут. Отступы, шрифты, заголовки, список литературы.",
  keywords: [
    "форматирование курсовой по ГОСТу",
    "автоматическое форматирование дипломных работ",
    "оформление научных работ онлайн",
    "оформление по методичке",
    "нейросеть для оформления курсовой",
    "исправление отступов и шрифтов",
    "оформление списка литературы",
    "ИИ помощник для студентов",
    "форматирование диплома",
    "оформление реферата по ГОСТу",
  ],
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    title: "SmartFormat — Идеальное оформление научной работы по методичке",
    description:
      "Загрузите работу и методичку — ИИ автоматически оформит документ по ГОСТу и требованиям вашего вуза.",
    siteName: "SmartFormat",
    locale: "ru_RU",
    type: "website",
    url: BASE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartFormat — Форматирование научных работ по ГОСТу",
    description: "ИИ-сервис автоматического оформления дипломов, курсовых и рефератов по методичке вуза.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geologica:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <JsonLd data={getWebSiteSchema()} />
        <JsonLd data={getSoftwareApplicationSchema()} />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider initialSession={null}>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
