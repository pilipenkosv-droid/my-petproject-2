import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { saveFile, saveResultFile, saveFullVersionFile } from "@/lib/storage/file-storage";
import { createJob, updateJobProgress, updateJob, completeJob, failJob } from "@/lib/storage/job-store";
import { isValidSourceDocument, getMimeTypeByExtension } from "@/lib/pipeline/text-extractor";
import { DEFAULT_GOST_RULES } from "@/types/formatting-rules";
import { checkProcessingAccess } from "@/lib/auth/api-auth";
import { markTrialUsed } from "@/lib/auth/trial";
import { getUserAccess, consumeUse } from "@/lib/payment/access";
import { runPipelineV6 } from "@/lib/pipeline-v6/orchestrator";
import { adaptPipelineV6ToLegacy, type AccessType } from "@/lib/pipeline-v6/adapter-legacy";

export const maxDuration = 300;

/**
 * Обработка документа по стандартному ГОСТу (pipeline-v6, template-first).
 */
export async function POST(request: NextRequest) {
  const auth = await checkProcessingAccess();

  if (auth.type === "blocked") {
    return NextResponse.json(
      { error: auth.reason, requiresAuth: true },
      { status: 403 }
    );
  }

  const userId = auth.type === "authenticated" ? auth.userId : undefined;
  const isAnonymous = auth.type === "anonymous";
  const jobId = nanoid();

  try {
    const ymUid = request.cookies.get("_ym_uid")?.value ?? undefined;
    const sessionId = request.cookies.get("dlx_sid")?.value ?? undefined;
    const referer = request.headers.get("referer") ?? undefined;
    await createJob(jobId, { userId, sessionId, yandexClientId: ymUid, referrer: referer });
    await updateJobProgress(jobId, "uploading", 5, "Получение файла");

    const formData = await request.formData();
    const sourceFile = formData.get("sourceDocument") as File | null;
    const workType = formData.get("workType") as string | null;

    if (!sourceFile) {
      await failJob(jobId, "Необходимо загрузить документ");
      return NextResponse.json(
        { error: "Необходимо загрузить документ" },
        { status: 400 }
      );
    }

    const sourceMimeType = sourceFile.type || getMimeTypeByExtension(sourceFile.name) || "";

    if (!isValidSourceDocument(sourceMimeType)) {
      await failJob(jobId, "Документ должен быть в формате .docx");
      return NextResponse.json(
        { error: "Документ должен быть в формате .docx" },
        { status: 400 }
      );
    }

    await updateJobProgress(jobId, "uploading", 10, "Сохранение файла");

    const sourceBuffer = Buffer.from(await sourceFile.arrayBuffer());
    const savedSource = await saveFile({
      buffer: sourceBuffer,
      originalName: sourceFile.name,
      mimeType: sourceMimeType,
    });

    await updateJob(jobId, {
      sourceDocumentId: savedSource.id,
      sourceOriginalName: sourceFile.name,
      workType: workType || undefined,
      requirementsMode: "gost",
      rules: DEFAULT_GOST_RULES,
    });

    let userAccessType: AccessType = "trial";
    if (userId) {
      const access = await getUserAccess(userId);
      userAccessType = access.accessType as AccessType;
      if (!access.hasAccess) {
        await failJob(jobId, "Лимит обработок исчерпан");
        return NextResponse.json(
          { error: "Лимит обработок исчерпан. Приобретите тариф.", redirectTo: "/pricing" },
          { status: 402 }
        );
      }
      if (access.accessType !== "admin") {
        const consumed = await consumeUse(userId);
        if (!consumed) {
          console.error("[process-gost] consumeUse failed for user:", userId);
          await failJob(jobId, "Не удалось списать использование");
          return NextResponse.json(
            { error: "Ошибка списания использования. Попробуйте снова." },
            { status: 500 }
          );
        }
      }
    }

    await updateJobProgress(jobId, "analyzing", 20, "AI-разметка блоков документа");

    // v6 не эмитит stage-события — шлём опорные тики, чтобы фронт последовательно
    // зажигал analyzing → formatting так же, как у старого pipeline.
    const tick50 = setTimeout(() => {
      updateJobProgress(jobId, "analyzing", 50, "Проверка документа на соответствие ГОСТ").catch(() => {});
    }, 1500);
    const tick70 = setTimeout(() => {
      updateJobProgress(jobId, "formatting", 70, "Применение форматирования по ГОСТ").catch(() => {});
    }, 4000);

    let pipelineResult;
    try {
      pipelineResult = await runPipelineV6(sourceBuffer, {
        documentId: jobId,
        templateSlug: "gost-7.32",
        rewrite: false,
        fixIterations: 1,
      });
    } finally {
      clearTimeout(tick50);
      clearTimeout(tick70);
    }

    const adapted = await adaptPipelineV6ToLegacy(sourceBuffer, pipelineResult, userAccessType);

    await updateJobProgress(jobId, "formatting", 90, "Сохранение результатов");

    await saveResultFile(jobId, "original", adapted.markedOriginal);
    await saveResultFile(jobId, "formatted", adapted.formattedDocument);

    let hasFullVersion = false;
    if (adapted.fullMarkedOriginal && adapted.fullFormattedDocument) {
      await Promise.all([
        saveFullVersionFile(jobId, "original", adapted.fullMarkedOriginal),
        saveFullVersionFile(jobId, "formatted", adapted.fullFormattedDocument),
      ]);
      hasFullVersion = true;
    }

    const statistics = {
      ...adapted.statistics,
      fixesApplied: adapted.fixesApplied,
      violationsDetected: adapted.violations.length,
    };

    await completeJob(jobId, {
      markedOriginalId: `${jobId}_original`,
      formattedDocumentId: `${jobId}_formatted`,
      violations: adapted.violations,
      statistics,
      rules: DEFAULT_GOST_RULES,
      ...(hasFullVersion && { hasFullVersion: true }),
    });

    const response = NextResponse.json({
      jobId,
      status: "completed",
      statistics,
      violationsCount: adapted.violations.length,
    });

    if (isAnonymous) {
      markTrialUsed(response);
    }

    return response;

  } catch (error) {
    console.error("Process GOST (v6) error:", error);

    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";

    if (jobId) {
      try {
        await failJob(jobId, errorMessage);
      } catch (failError) {
        console.error("Failed to mark job as failed:", failError);
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
