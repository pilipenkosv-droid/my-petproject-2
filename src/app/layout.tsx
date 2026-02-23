import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { JsonLd } from "@/components/JsonLd";
import { YandexMetrika } from "@/components/analytics/YandexMetrika";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { getSoftwareApplicationSchema, getWebSiteSchema } from "@/lib/seo/schemas";
import { SITE_URL, SITE_NAME } from "@/lib/config/site";
import { Footer } from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Diplox — Автоматическое форматирование научных работ по методичке онлайн",
    template: "%s | Diplox",
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
    "ГОСТ 7.32-2017 оформление",
    "ГОСТ 7.1 список литературы",
    "оформление диссертации по ГОСТу",
    "требования к научной работе 2026",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "Diplox — Идеальное оформление научной работы по методичке",
    description:
      "Загрузите работу и методичку — ИИ автоматически оформит документ по ГОСТу и требованиям вашего вуза.",
    siteName: "Diplox",
    locale: "ru_RU",
    type: "website",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Diplox — Форматирование научных работ по ГОСТу",
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
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geologica:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&family=Play:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <JsonLd data={getWebSiteSchema()} />
        <JsonLd data={getSoftwareApplicationSchema()} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <AuthProvider initialSession={null}>
            {children}
            <Footer />
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <Suspense fallback={null}>
          <YandexMetrika />
          <GoogleAnalytics />
        </Suspense>
      </body>
    </html>
  );
}
