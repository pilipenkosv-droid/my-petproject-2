import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/storage/job-store";
import { FormattingViolation } from "@/types/formatting-rules";

interface ChangeSummaryItem {
  type: string;
  count: number;
  before: string;
  after: string;
}

function buildChangesSummary(violations: FormattingViolation[]): ChangeSummaryItem[] {
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

  return Array.from(groups.entries())
    .map(([key, g]) => ({
      type: key.split("|")[0],
      count: g.count,
      before: g.before,
      after: g.after,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
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

  const changesSummary = job.violations ? buildChangesSummary(job.violations) : [];

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    statusMessage: job.statusMessage,
    error: job.error,
    statistics: job.statistics,
    violationsCount: job.violations?.length ?? 0,
    fixesApplied: job.violations?.filter((v) => v.autoFixable).length ?? 0,
    changesSummary,
    hasFullVersion: job.hasFullVersion,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
