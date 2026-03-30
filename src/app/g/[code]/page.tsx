import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroupByCode } from "@/lib/group/utils";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, CheckCircle, FileCheck, ArrowRight } from "lucide-react";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";

interface GroupPageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: GroupPageProps): Promise<Metadata> {
  const { code } = await params;
  const group = await getGroupByCode(code);

  return {
    title: group
      ? `Присоединяйся — бесплатная проверка работы | Diplox`
      : "Diplox — Форматирование по ГОСТу",
    description: group
      ? `${group.memberCount} студентов уже проверили работы. Присоединись — получи бесплатную проверку.`
      : "Автоматическое форматирование научных работ по ГОСТу",
    openGraph: {
      title: "Проверь свою работу бесплатно — Diplox",
      description: `${group?.memberCount ?? 0} одногруппников уже оформили документы. Присоединись и получи бесплатную проверку.`,
      url: `${SITE_URL}/g/${code}`,
    },
  };
}

export default async function GroupLandingPage({ params }: GroupPageProps) {
  const { code } = await params;
  const group = await getGroupByCode(code);

  if (!group || !group.is_active) {
    notFound();
  }

  const daysLeft = group.expires_at
    ? Math.max(0, Math.ceil((new Date(group.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <main className="min-h-screen relative">
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <Header />

      <div className="relative z-10 mx-auto max-w-lg px-6 py-16">
        <div className="space-y-8 text-center">
          {/* Hero */}
          <div>
            <div className="w-16 h-16 bg-foreground flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-background" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-3">
              Оформи работу бесплатно
            </h1>
            <p className="text-on-surface-subtle text-lg">
              {group.memberCount > 0
                ? `${group.memberCount} ${pluralize(group.memberCount, "студент", "студента", "студентов")} уже проверили свои работы`
                : "Присоединись к группе — получи бесплатную проверку"
              }
            </p>
          </div>

          {/* Countdown */}
          {daysLeft !== null && daysLeft > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/10">
              <CardContent className="py-4">
                <p className="text-amber-600 font-semibold">
                  До конца сессии: {daysLeft} {pluralize(daysLeft, "день", "дня", "дней")}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Benefits */}
          <Card>
            <CardContent className="py-6 space-y-4">
              <div className="flex items-start gap-3 text-left">
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Бесплатная проверка</p>
                  <p className="text-sm text-on-surface-subtle">Зарегистрируйся по этой ссылке — первая обработка за наш счёт</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-left">
                <FileCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Форматирование по ГОСТу</p>
                  <p className="text-sm text-on-surface-subtle">Шрифты, отступы, интервалы, нумерация — всё по требованиям</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-left">
                <Users className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Для всей группы</p>
                  <p className="text-sm text-on-surface-subtle">Каждый получает бонусную проверку при присоединении</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CTA */}
          <Link href={`/login?next=/create&ref=group&code=${code}`}>
            <Button variant="glow" size="lg" className="w-full group text-lg py-6">
              Получить бесплатную проверку
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>

          <p className="text-xs text-muted-foreground">
            Без скрытых платежей. Регистрация за 30 секунд.
          </p>
        </div>
      </div>
    </main>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
