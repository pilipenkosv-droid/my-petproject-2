import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/storage/job-store";
import { failIfStuck, STUCK_STATUSES } from "@/lib/storage/job-stuck";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { FormattingViolation } from "@/types/formatting-rules";

// Функция обработки укладывается в maxDuration=60 у Vercel; прогресс обновляет
// updated_at чаще. Если статус промежуточный дольше этого порога — функция,
// скорее всего, убита таймаутом и job зависла. Самоисцеление на чтении статуса,
// не дожидаясь суточного /api/cleanup (см. resetStuckJobs).
const STUCK_AFTER_MS = 3 * 60 * 1000;

interface ChangeSummaryItem {
  type: string;
  count: number;
  before: string;
  after: string;
}

function buildChangesSummary(violations: FormattingViolation[]): { items: ChangeSummaryItem[]; uniqueCount: number } {
  const groups = new Map<string, { count: number; before: string; after: string }>();

  for (const v of violations) {
    if (!v.autoFixable) continue;
    const key = `${v.message}|${v.actual}|${v.expected}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, {
        count: 1,
        before: v.actual ?? "",
        after: v.expected ?? "",
      });
    }
  }

  const sorted = Array.from(groups.entries())
    .map(([key, g]) => ({
      type: key.split("|")[0],
      count: g.count,
      before: g.before,
      after: g.after,
    }))
    .sort((a, b) => b.count - a.count);

  return { items: sorted.slice(0, 5), uniqueCount: sorted.length };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  let job = await getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: "Задача не найдена" },
      { status: 404 }
    );
  }

  // Самоисцеление: убитая таймаутом Vercel задача не должна висеть в
  // промежуточном статусе до ежедневного /api/cleanup.
  if (STUCK_STATUSES.includes(job.status)) {
    const healed = await failIfStuck(jobId, STUCK_AFTER_MS);
    if (healed) {
      job = healed;
    }
  }

  // Для статуса awaiting_confirmation возвращаем правила
  if (job.status === "awaiting_confirmation") {
    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      statusMessage: job.statusMessage,
      rules: job.rules,
      hasGuidelinesText: !!job.guidelinesText,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  }

  const { items: changesSummary, uniqueCount } = job.violations
    ? buildChangesSummary(job.violations)
    : { items: [], uniqueCount: 0 };
  const fixesApplied = job.violations?.filter((v) => v.autoFixable).length ?? 0;

  // Проверяем, была ли оплата за этот job (для скрытия upsell-баннера)
  let paymentCompleted = false;
  if (job.hasFullVersion) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("payments")
      .select("id")
      .eq("unlock_job_id", jobId)
      .eq("status", "completed")
      .limit(1)
      .single();
    paymentCompleted = !!data;
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    statusMessage: job.statusMessage,
    error: job.error,
    statistics: job.statistics,
    violationsCount: uniqueCount,
    fixesApplied,
    changesSummary,
    hasFullVersion: job.hasFullVersion,
    paymentCompleted,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
