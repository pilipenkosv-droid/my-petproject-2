// Beta endpoint — routes allow-listed users/requests through pipeline-v6.
// Does NOT replace /api/process-gost. Consumers must opt-in via flag.
// See src/lib/pipeline-v6/feature-flag.ts for rollout rules.

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import * as path from "path";
import { checkProcessingAccess } from "@/lib/auth/api-auth";
import { saveFile, saveResultFile } from "@/lib/storage/file-storage";
import { createJob, updateJobProgress, updateJob, failJob } from "@/lib/storage/job-store";
import { getMimeTypeByExtension, isValidSourceDocument } from "@/lib/pipeline/text-extractor";
import { shouldUsePipelineV6 } from "@/lib/pipeline-v6/feature-flag";
import { runPipelineV6 } from "@/lib/pipeline-v6/orchestrator";

export const maxDuration = 300;

const REFERENCE_DOC = path.join(
  process.cwd(),
  "scripts/pipeline-v6/spike-pandoc/reference-gost.docx",
);

export async function POST(request: NextRequest) {
  const auth = await checkProcessingAccess();
  if (auth.type === "blocked") {
    return NextResponse.json({ error: auth.reason, requiresAuth: true }, { status: 403 });
  }

  const userId = auth.type === "authenticated" ? auth.userId : undefined;
  const flag = shouldUsePipelineV6({
    userId,
    query: request.nextUrl.searchParams,
    cookies: request.cookies,
  });
  if (!flag.enabled) {
    return NextResponse.json(
      { error: "pipeline-v6 is off for this request", hint: "add ?v6=1 or ask for allowlist" },
      { status: 403 },
    );
  }

  const jobId = nanoid();
  try {
    await createJob(jobId, { userId });
    await updateJobProgress(jobId, "uploading", 5, "Получение файла");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      await failJob(jobId, "Файл не найден");
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }
    const mime = getMimeTypeByExtension(file.name);
    if (!mime || !isValidSourceDocument(mime)) {
      await failJob(jobId, "Формат не поддерживается");
      return NextResponse.json({ error: "Формат не поддерживается" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await saveFile({ buffer, originalName: file.name, mimeType: mime });

    await updateJobProgress(jobId, "analyzing", 30, "pipeline-v6: extract + analyze");
    const result = await runPipelineV6(buffer, {
      documentId: jobId,
      referenceDoc: REFERENCE_DOC,
      rewrite: false,
      metadata: { title: file.name.replace(/\.docx$/i, ""), lang: "ru" },
      fixIterations: 1,
    });

    await updateJobProgress(jobId, "formatting", 90, "Сохранение результатов");
    await saveResultFile(jobId, "formatted", result.output);
    await saveResultFile(jobId, "original", buffer);

    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      statusMessage: "v6 pipeline complete",
    });
    console.log(`[process-v6] ${jobId} flag=${flag.reason} initial=${result.initialReport.score} final=${result.finalReport.score} totalMs=${result.timings.totalMs}`);

    return NextResponse.json({
      jobId,
      pipeline: "v6",
      flagReason: flag.reason,
      initialScore: result.initialReport.score,
      finalScore: result.finalReport.score,
      suggestions: result.suggestions.slice(0, 10),
      timings: result.timings,
    });
  } catch (err) {
    await failJob(jobId, err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "pipeline-v6 failed", jobId },
      { status: 500 },
    );
  }
}
