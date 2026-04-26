import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProUpsellBanner } from "@/features/result/components/ProUpsellBanner";
import { CopyButton } from "./CopyButton";

// Страница приватная: доступна только по email-ссылке с access_token.
// Не индексируется (см. metadata ниже + Disallow в robots.txt).
export const metadata = {
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

const TOOL_LABELS: Record<string, string> = {
  rewrite: "Переписанный текст",
  summarize: "Краткое содержание",
  outline: "План работы",
  "ask-guidelines": "Ответ по методичке",
};

export default async function ToolOutputPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { t: providedToken } = await searchParams;

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("tool_outputs")
    .select("id, tool, full_output, access_token, expires_at, created_at")
    .eq("id", id)
    .single();

  if (error || !row) {
    notFound();
  }

  // Без действительного токена — 404 (не намекаем, что row существует).
  if (!row.access_token || !providedToken || !tokensMatch(providedToken, row.access_token)) {
    notFound();
  }

  const expired = new Date(row.expires_at) < new Date();
  const label = TOOL_LABELS[row.tool] ?? "Результат";

  if (expired) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <Card>
            <CardHeader>
              <CardTitle>Ссылка истекла</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-on-surface-muted">
                Срок действия ссылки на этот результат закончился. Полные результаты доступны 7 дней.
              </p>
              <p className="text-on-surface-muted">
                С подпиской Pro полный результат показывается сразу, без email-гейта и без ограничений на срок хранения.
              </p>
              <div className="flex gap-3">
                <Link href="/pricing?ref=tool-output-expired">
                  <Button>Оформить Pro</Button>
                </Link>
                <Link href="/">
                  <Button variant="outline">На главную</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{label}</h1>
          <CopyButton text={row.full_output} />
        </div>

        <Card>
          <CardContent className="pt-6">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
              {row.full_output}
            </pre>
          </CardContent>
        </Card>

        <ProUpsellBanner />
      </div>
    </main>
  );
}
