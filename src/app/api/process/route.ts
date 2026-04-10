import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { saveFile, saveResultFile, saveFullVersionFile } from "@/lib/storage/file-storage";
import { createJob, updateJobProgress, updateJob, completeJob, failJob } from "@/lib/storage/job-store";
import { extractText, isValidSourceDocument, isValidRequirementsDocument, getMimeTypeByExtension } from "@/lib/pipeline/text-extractor";
import { parseFormattingRules, mergeWithDefaults } from "@/lib/ai/provider";
import { analyzeDocument, parseDocxStructure, enrichWithBlockMarkup } from "@/lib/pipeline/document-analyzer";
import { formatDocument } from "@/lib/pipeline/document-formatter";
import { getUserAccess, consumeUse } from "@/lib/payment/access";
import { checkProcessingAccess } from "@/lib/auth/api-auth";
import { markTrialUsed } from "@/lib/auth/trial";


export const maxDuration = 60; // Максимальное время выполнения для Vercel

export async function POST(request: NextRequest) {
  const jobId = nanoid();

  try {
    // Проверяем доступ пользователя
    const auth = await checkProcessingAccess();

    if (auth.type === "blocked") {
      return NextResponse.json(
        { error: auth.reason, requiresAuth: true },
        { status: 403 }
      );
    }

    const user = auth.type === "authenticated" ? auth.user : null;
    let userAccessType: "trial" | "one_time" | "subscription" | "subscription_plus" | "subscription_plus_trial" | "admin" | "none" = "trial";

    if (user?.id) {
      const access = await getUserAccess(user.id);
      userAccessType = access.accessType;
      if (!access.hasAccess) {
        return NextResponse.json(
          { error: "Лимит обработок исчерпан. Приобретите тариф.", redirectTo: "/pricing" },
          { status: 402 }
        );
      }
      // Списываем использование (для всех, кроме админа)
      if (access.accessType !== "admin") {
        const consumed = await consumeUse(user.id);
        if (!consumed) {
          console.error("[process] consumeUse failed for user:", user.id);
          return NextResponse.json(
            { error: "Ошибка списания использования. Попробуйте снова." },
            { status: 500 }
          );
        }
      }
    }

    // Создаём задачу
    const ymUid = request.cookies.get("_ym_uid")?.value ?? undefined;
    const sessionId = request.cookies.get("dlx_sid")?.value ?? undefined;
    const referer = request.headers.get("referer") ?? undefined;
    await createJob(jobId, { userId: user?.id, sessionId, yandexClientId: ymUid, referrer: referer });
    await updateJobProgress(jobId, "uploading", 5, "Получение файлов");

    // Получаем файлы из FormData
    const formData = await request.formData();
    const sourceFile = formData.get("sourceDocument") as File | null;
    const requirementsFile = formData.get("requirementsDocument") as File | null;

    if (!sourceFile || !requirementsFile) {
      await failJob(jobId, "Необходимо загрузить оба файла");
      return NextResponse.json(
        { error: "Необходимо загрузить оба файла" },
        { status: 400 }
      );
    }

    // Определяем MIME-типы (с fallback на расширение)
    const sourceMimeType = sourceFile.type || getMimeTypeByExtension(sourceFile.name) || "";
    const requirementsMimeType = requirementsFile.type || getMimeTypeByExtension(requirementsFile.name) || "";

    // Валидация типов файлов
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

    // Читаем файлы в буферы
    const sourceBuffer = Buffer.from(await sourceFile.arrayBuffer());
    const requirementsBuffer = Buffer.from(await requirementsFile.arrayBuffer());

    // Сохраняем исходные файлы
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

    await updateJobProgress(jobId, "extracting_text", 20, "Извлечение текста из документов");

    // Извлекаем текст из документа с требованиями
    const requirementsText = await extractText(requirementsBuffer, requirementsMimeType);

    if (!requirementsText || requirementsText.trim().length < 50) {
      await failJob(jobId, "Документ с требованиями слишком короткий или пустой");
      return NextResponse.json(
        { error: "Документ с требованиями слишком короткий или пустой" },
        { status: 400 }
      );
    }

    await updateJobProgress(jobId, "parsing_rules", 35, "Анализ требований форматирования с помощью AI");

    // Парсим правила форматирования через AI
    const aiResponse = await parseFormattingRules(requirementsText);
    const rules = mergeWithDefaults(aiResponse.rules);

    await updateJobProgress(jobId, "analyzing", 50, "AI-разметка блоков документа");

    // Парсим структуру и размечаем блоки через AI
    const docxStructure = await parseDocxStructure(sourceBuffer);
    const blockMarkupResult = await enrichWithBlockMarkup(docxStructure.paragraphs);
    const enrichedParagraphs = blockMarkupResult.paragraphs;

    // Сохраняем model_id для корреляции с CSAT (fire-and-forget)
    if (blockMarkupResult.modelId) {
      updateJob(jobId, { modelId: blockMarkupResult.modelId }).catch(() => {});
    }

    await updateJobProgress(jobId, "analyzing", 60, "Проверка документа на соответствие требованиям");

    // Анализируем документ
    const analysisResult = await analyzeDocument(sourceBuffer, rules, enrichedParagraphs);

    await updateJobProgress(jobId, "formatting", 75, "Применение форматирования через XML");

    // Форматируем документ через XML-модификацию (сохраняет картинки и таблицы)
    // Для trial — обрезка до 50% документа происходит ПОСЛЕ форматирования
    const formattingResult = await formatDocument(sourceBuffer, rules, analysisResult.violations, enrichedParagraphs, userAccessType);

    await updateJobProgress(jobId, "formatting", 90, "Сохранение результатов");

    // Сохраняем результаты (обрезанные для trial)
    await saveResultFile(jobId, "original", formattingResult.markedOriginal);
    await saveResultFile(jobId, "formatted", formattingResult.formattedDocument);

    // Если есть полные версии (trial с обрезкой) — сохраняем их для разблокировки после оплаты
    let hasFullVersion = false;
    if (formattingResult.fullMarkedOriginal && formattingResult.fullFormattedDocument) {
      await Promise.all([
        saveFullVersionFile(jobId, "original", formattingResult.fullMarkedOriginal),
        saveFullVersionFile(jobId, "formatted", formattingResult.fullFormattedDocument),
      ]);
      hasFullVersion = true;
      console.log(`[process] Saved full versions for job ${jobId} (hook-offer)`);
    }

    // Добавляем информацию об обрезке в статистику (если была)
    const statistics = {
      ...analysisResult.statistics,
      ...(formattingResult.wasTruncated && {
        wasTruncated: true,
        originalPageCount: formattingResult.originalPageCount,
        pageLimitApplied: formattingResult.pageLimitApplied,
      }),
    };

    // Завершаем задачу
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
      warnings: aiResponse.warnings,
    });

    // Помечаем триал как использованный для анонимов
    if (!user?.id) {
      markTrialUsed(response);
    }

    return response;

  } catch (error) {
    console.error("Processing error:", error);

    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
    await failJob(jobId, errorMessage);

    return NextResponse.json(
      { error: errorMessage, jobId },
      { status: 500 }
    );
  }
}
