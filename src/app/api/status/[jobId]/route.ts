import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/storage/job-store";
import { FormattingViolation } from "@/types/formatting-rules";

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

  const job = await getJob(jobId);
  
  if (!job) {
    return NextResponse.json(
      { error: "Задача не найдена" },
      { status: 404 }
    );
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
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
