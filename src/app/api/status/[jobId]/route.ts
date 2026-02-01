import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/storage/job-store";

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
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    statusMessage: job.statusMessage,
    error: job.error,
    statistics: job.statistics,
    violationsCount: job.violations?.length ?? 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
