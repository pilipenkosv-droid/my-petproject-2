import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { saveFile } from "@/lib/storage/file-storage";
import { createJob, updateJobProgress, updateJob, failJob } from "@/lib/storage/job-store";
import { isValidSourceDocument, isValidRequirementsDocument, getMimeTypeByExtension } from "@/lib/pipeline/text-extractor";
import { RulesExtractionError, rulesExtractionMessage } from "@/lib/ai/provider";
import { AIBudgetExceededError } from "@/lib/ai/gateway";
import { checkProcessingAccess } from "@/lib/auth/api-auth";
import { markTrialUsed } from "@/lib/auth/trial";
import {
  processExtractRulesJob,
  RequirementsTooShortError,
} from "@/lib/processing/extract-rules-job";
import { shouldQueueForWorker } from "@/lib/processing/mode";
import { markJobQueued } from "@/lib/processing/enqueue";

export const maxDuration = 60; // Vercel Hobby cap = 60s (было 300 на Pro)

/**
 * Первый этап: извлечение правил форматирования из методички
 * После этого пользователь может просмотреть и отредактировать правила
 */
/** Запас на ответ и запись в БД после того, как AI отработал. */
const REQUEST_BUDGET_MS = 50_000;

export async function POST(request: NextRequest) {
  // Дедлайн всего запроса: maxDuration = 60с, Vercel убивает функцию без шанса
  // записать статус — job застревает на progress=50 до resetStuckJobs.
  const deadline = Date.now() + REQUEST_BUDGET_MS;

  // Проверка авторизации / триала
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
    await updateJobProgress(jobId, "uploading", 5, "Получение файлов");

    const formData = await request.formData();
    const sourceFile = formData.get("sourceDocument") as File | null;
    const requirementsFile = formData.get("requirementsDocument") as File | null;
    const workType = formData.get("workType") as string | null;

    if (!sourceFile || !requirementsFile) {
      await failJob(jobId, "Необходимо загрузить оба файла");
      return NextResponse.json(
        { error: "Необходимо загрузить оба файла" },
        { status: 400 }
      );
    }

    const sourceMimeType = sourceFile.type || getMimeTypeByExtension(sourceFile.name) || "";
    const requirementsMimeType = requirementsFile.type || getMimeTypeByExtension(requirementsFile.name) || "";

    if (!isValidSourceDocument(sourceMimeType)) {
      await failJob(jobId, "Исходный документ должен быть в формате .docx");
      return NextResponse.json(
        { error: "Исходный документ должен быть в формате .docx" },
        { status: 400 }
      );
    }

    if (!isValidRequirementsDocument(requirementsMimeType)) {
      await failJob(jobId, "Документ с требованиями должен быть в формате .docx, .pdf или .txt");
      return NextResponse.json(
        { error: "Документ с требованиями должен быть в формате .docx, .pdf или .txt" },
        { status: 400 }
      );
    }

    await updateJobProgress(jobId, "uploading", 10, "Сохранение файлов");

    const sourceBuffer = Buffer.from(await sourceFile.arrayBuffer());
    const requirementsBuffer = Buffer.from(await requirementsFile.arrayBuffer());

    const savedSource = await saveFile({
      buffer: sourceBuffer,
      originalName: sourceFile.name,
      mimeType: sourceMimeType,
    });

    const savedRequirements = await saveFile({
      buffer: requirementsBuffer,
      originalName: requirementsFile.name,
      mimeType: requirementsMimeType,
    });

    // Сохраняем ID файлов в job
    await updateJob(jobId, {
      sourceDocumentId: savedSource.id,
      requirementsDocumentId: savedRequirements.id,
      sourceOriginalName: sourceFile.name,
      requirementsOriginalName: requirementsFile.name,
      workType: workType || undefined,
      requirementsMode: "upload",
    });

    // Режим очереди: методичку разбирает воркер на VDS, роут отвечает сразу.
    if (await shouldQueueForWorker(jobId)) {
      await markJobQueued(jobId, "Методичка в очереди на разбор");

      const queued = NextResponse.json({ jobId, status: "pending" }, { status: 202 });
      if (isAnonymous) {
        markTrialUsed(queued);
      }
      return queued;
    }

    const extracted = await processExtractRulesJob(
      jobId,
      requirementsBuffer,
      requirementsMimeType,
      { deadline }
    );

    // Для анонимных — помечаем триал как использованный
    const response = NextResponse.json({
      jobId,
      status: "awaiting_confirmation",
      rules: extracted.rules,
      confidence: extracted.confidence,
      warnings: extracted.warnings,
      missingRules: extracted.missingRules,
    });

    if (isAnonymous) {
      markTrialUsed(response);
    }

    return response;

  } catch (error) {
    console.error("Extract rules error:", error);

    // Текст методички не набрал минимума — ответ 400, как и раньше.
    if (error instanceof RequirementsTooShortError) {
      await failJob(jobId, error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Бюджет исчерпан: списаний в upload-режиме нет (consumeUse живёт в /process,
    // markTrialUsed — только на успешном ответе), возврат не нужен.
    if (error instanceof AIBudgetExceededError) {
      const message =
        "Не удалось разобрать методичку за отведённое время, попробуйте ещё раз или выберите ГОСТ";
      await failJob(jobId, message);
      return NextResponse.json({ error: message, jobId }, { status: 504 });
    }

    // Правила не извлеклись: молча подставить ГОСТ нельзя — пользователь
    // загрузил свою методичку. Списаний в upload-режиме нет, возврат не нужен.
    if (error instanceof RulesExtractionError) {
      const message = rulesExtractionMessage(error);
      console.error(`[extract-rules] ${error.reason}: ${error.message}`);
      await failJob(jobId, message);
      return NextResponse.json({ error: message, jobId, reason: error.reason }, { status: 422 });
    }

    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
    await failJob(jobId, errorMessage);

    return NextResponse.json(
      { error: errorMessage, jobId },
      { status: 500 }
    );
  }
}
