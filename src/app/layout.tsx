import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { createSupabaseServer } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartFormat — Автоматическое форматирование научных работ по методичке онлайн",
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
  ],
  openGraph: {
    title: "SmartFormat — Идеальное оформление научной работы по методичке",
    description:
      "Загрузите работу и методичку — ИИ автоматически оформит документ по ГОСТу и требованиям вашего вуза.",
    siteName: "SmartFormat",
    locale: "ru_RU",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geologica:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider initialSession={session}>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
