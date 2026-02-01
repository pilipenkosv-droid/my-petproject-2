import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { createSupabaseServer } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartFormat — Автоформатирование научных работ",
  description:
    "Автоматически приводим курсовые, дипломы и научные работы к требованиям форматирования вашего ВУЗа",
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
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
