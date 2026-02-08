import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { saveFile, saveResultFile, saveFullVersionFile } from "@/lib/storage/file-storage";
import { createJob, updateJobProgress, updateJob, completeJob, failJob } from "@/lib/storage/job-store";
import { isValidSourceDocument, getMimeTypeByExtension } from "@/lib/pipeline/text-extractor";
import { analyzeDocument, parseDocxStructure, enrichWithBlockMarkup } from "@/lib/pipeline/document-analyzer";
import { formatDocument, AccessType } from "@/lib/pipeline/document-formatter";
import { DEFAULT_GOST_RULES } from "@/types/formatting-rules";
import { checkProcessingAccess } from "@/lib/auth/api-auth";
import { markTrialUsed } from "@/lib/auth/trial";
import { getUserAccess } from "@/lib/payment/access";
import { LAVA_CONFIG } from "@/lib/payment/config";

export const maxDuration = 60;

/**
 * Обработка документа по стандартному ГОСТу (без методички).
 * Объединяет extract-rules + confirm-rules в один шаг.
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
    await createJob(jobId, userId);
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

    // Определяем тип доступа
    let userAccessType: AccessType = "trial";
    if (userId) {
      const access = await getUserAccess(userId);
      userAccessType = access.accessType;
    }

    const rules = DEFAULT_GOST_RULES;

    // Парсим структуру и размечаем блоки через AI
    await updateJobProgress(jobId, "analyzing", 20, "AI-разметка блоков документа");
    const docxStructure = await parseDocxStructure(sourceBuffer);
    const enrichedParagraphs = await enrichWithBlockMarkup(docxStructure.paragraphs);

    // Анализируем документ
    await updateJobProgress(jobId, "analyzing", 50, "Проверка документа на соответствие ГОСТ");
    const analysisResult = await analyzeDocument(sourceBuffer, rules, enrichedParagraphs);

    // Форматируем
    await updateJobProgress(jobId, "formatting", 70, "Применение форматирования по ГОСТ");
    const formattingResult = await formatDocument(sourceBuffer, rules, analysisResult.violations, enrichedParagraphs, userAccessType);

    await updateJobProgress(jobId, "formatting", 90, "Сохранение результатов");

    // Сохраняем результаты
    await saveResultFile(jobId, "original", formattingResult.markedOriginal);
    await saveResultFile(jobId, "formatted", formattingResult.formattedDocument);

    // Полные версии (для trial)
    let hasFullVersion = false;
    if (formattingResult.fullMarkedOriginal && formattingResult.fullFormattedDocument) {
      await Promise.all([
        saveFullVersionFile(jobId, "original", formattingResult.fullMarkedOriginal),
        saveFullVersionFile(jobId, "formatted", formattingResult.fullFormattedDocument),
      ]);
      hasFullVersion = true;
    }

    const statistics = {
      ...analysisResult.statistics,
      ...(formattingResult.wasTruncated && {
        wasTruncated: true,
        originalPageCount: formattingResult.originalPageCount,
        pageLimitApplied: LAVA_CONFIG.freeTrialMaxPages,
      }),
    };

    await completeJob(jobId, {
      markedOriginalId: `${jobId}_original`,
      formattedDocumentId: `${jobId}_formatted`,
      violations: analysisResult.violations,
      statistics,
      rules,
      ...(hasFullVersion && { hasFullVersion: true }),
    });

    const response = NextResponse.json({
      jobId,
      status: "completed",
      statistics,
      violationsCount: analysisResult.violations.length,
    });

    if (isAnonymous) {
      markTrialUsed(response);
    }

    return response;

  } catch (error) {
    console.error("Process GOST error:", error);

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
