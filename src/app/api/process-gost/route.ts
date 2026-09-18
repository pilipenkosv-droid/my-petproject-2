import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { saveFile } from "@/lib/storage/file-storage";
import { createJob, updateJobProgress, updateJob, failJob } from "@/lib/storage/job-store";
import { isValidSourceDocument, getMimeTypeByExtension } from "@/lib/pipeline/text-extractor";
import { DEFAULT_GOST_RULES } from "@/types/formatting-rules";
import { checkProcessingAccess } from "@/lib/auth/api-auth";
import { markTrialUsed } from "@/lib/auth/trial";
import { getUserAccess, consumeUse } from "@/lib/payment/access";
import { markUseConsumed, refundUse, compensateConsume } from "@/lib/payment/refund";
import { type AccessType } from "@/lib/pipeline-v6/adapter-legacy";
import { processGostJob } from "@/lib/processing/gost-job";
import { getProcessingMode, shouldQueueForWorker } from "@/lib/processing/mode";
import { createShadowJob, markJobQueued } from "@/lib/processing/enqueue";

export const maxDuration = 60; // Vercel Hobby cap = 60s (было 300 на Pro)

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
        const marked = await markUseConsumed(jobId);
        if (!marked) {
          // Отметка не встала → refundUse() потом не опознает списание.
          // Компенсируем сразу и валим задачу, иначе использование сгорит молча.
          await compensateConsume(userId);
          await failJob(jobId, "Не удалось зафиксировать списание использования");
          return NextResponse.json(
            { error: "Ошибка списания использования. Попробуйте снова." },
            { status: 500 }
          );
        }
      }
    }

    // Режим очереди: задачу забирает воркер на VDS, роут отвечает сразу.
    // Списание уже произошло выше — иначе пользователь без остатка ставил бы
    // в очередь сколько угодно документов.
    if (await shouldQueueForWorker(jobId)) {
      await markJobQueued(jobId, "В очереди на обработку");

      const queued = NextResponse.json(
        { jobId, status: "pending" },
        { status: 202 }
      );
      if (isAnonymous) {
        markTrialUsed(queued);
      }
      return queued;
    }

    const { statistics, violationsCount } = await processGostJob(
      jobId,
      sourceBuffer,
      userAccessType
    );

    // Теневой режим: пользователь получает результат инлайна, а воркер считает
    // копию той же задачи — для сравнения перед раскаткой.
    if (getProcessingMode() === "shadow") {
      await createShadowJob({
        jobId,
        sourceDocumentId: savedSource.id,
        sourceOriginalName: sourceFile.name,
        workType: workType || undefined,
        rules: DEFAULT_GOST_RULES,
      });
    }

    const response = NextResponse.json({
      jobId,
      status: "completed",
      statistics,
      violationsCount,
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
      try {
        await refundUse(userId, jobId, errorMessage);
      } catch (refundError) {
        console.error("Failed to refund use:", refundError);
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
