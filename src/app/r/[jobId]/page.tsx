import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck, ArrowRight, CheckCircle, Shield } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ShareButtons } from "@/components/ShareButtons";
import { getJob } from "@/lib/storage/job-store";
import { SITE_URL, SITE_NAME } from "@/lib/config/site";
import { SharePageTracker } from "./SharePageTracker";

const WORK_TYPE_LABELS: Record<string, string> = {
  diplom: "Дипломная",
  kursovaya: "Курсовая",
  referat: "Реферат",
  otchet: "Отчёт по практике",
  dissertation: "Диссертация",
  vkr: "Выпускная работа",
};

type Props = { params: Promise<{ jobId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return { title: `Результат | ${SITE_NAME}` };

  const workLabel = WORK_TYPE_LABELS[job.workType ?? ""] ?? "Работа";
  const fixesApplied = job.violations?.filter((v) => v.autoFixable).length ?? 0;
  const pageCount = job.statistics?.pageCount ?? 0;

  return {
    title: `Оформление ${workLabel} — ${fixesApplied} исправлений | ${SITE_NAME}`,
    description: `Автоматическое оформление по методичке. ${fixesApplied} нарушений исправлено на ${pageCount} стр.`,
    openGraph: {
      title: `Оформил ${workLabel}: ${fixesApplied} исправлений на ${pageCount} стр.`,
      description: "Diplox — бесплатная проверка оформления по ГОСТ и методичке вуза",
      url: `${SITE_URL}/r/${jobId}`,
      siteName: SITE_NAME,
      type: "website",
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) notFound();

  const workLabel = WORK_TYPE_LABELS[job.workType ?? ""] ?? "Работа";
  const fixesApplied = job.violations?.filter((v) => v.autoFixable).length ?? 0;
  const pageCount = job.statistics?.pageCount ?? 0;
  const violationsCount = job.violations?.length ?? 0;
  const shareUrl = `${SITE_URL}/r/${jobId}`;
  const ctaHref = `/create?utm_source=share&utm_medium=link&utm_campaign=result`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SharePageTracker jobId={jobId} />
      <Header showBack backHref="/" />

      <main className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-10">
        {/* Hero */}
        <section className="flex flex-col gap-4 items-center text-center">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium">
            <FileCheck className="w-4 h-4" />
            <span>{workLabel}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {fixesApplied}{" "}
            <span className="text-purple-400">исправлений</span>{" "}
            применено
          </h1>
          <p className="text-muted-foreground text-lg">
            {pageCount} стр. &bull; {violationsCount} нарушений устранено
          </p>
        </section>

        {/* CTA */}
        <section className="flex flex-col items-center gap-3">
          <Button asChild size="lg" className="w-full sm:w-auto text-base px-8 py-6">
            <Link href={ctaHref}>
              Оформи свою работу — бесплатно
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">Без регистрации, за несколько минут</p>
        </section>

        {/* Trust signals */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: CheckCircle, text: "Бесплатная проверка" },
            { icon: Shield, text: "По методичке вуза" },
            { icon: FileCheck, text: "Готово за минуту" },
          ].map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-surface-border"
            >
              <Icon className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-sm text-on-surface-muted">{text}</span>
            </div>
          ))}
        </section>

        {/* Re-share */}
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground text-center">Поделиться результатом</p>
          <div className="flex justify-center">
            <ShareButtons
              url={shareUrl}
              title={`Оформил ${workLabel}: ${fixesApplied} исправлений на ${pageCount} стр. — Diplox`}
              description="Попробуй бесплатную проверку оформления по ГОСТ и методичке вуза"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
