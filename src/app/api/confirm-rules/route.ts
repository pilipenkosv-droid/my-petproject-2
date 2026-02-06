import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJobProgress, completeJob, failJob } from "@/lib/storage/job-store";
import { getFile, saveResultFile, saveFullVersionFile } from "@/lib/storage/file-storage";
import { analyzeDocument, parseDocxStructure, enrichWithBlockMarkup } from "@/lib/pipeline/document-analyzer";
import { formatDocument, AccessType } from "@/lib/pipeline/document-formatter";
import { FormattingRules } from "@/types/formatting-rules";
import { getUserAccess } from "@/lib/payment/access";
import { LAVA_CONFIG } from "@/lib/payment/config";

export const maxDuration = 60;

/**
 * Второй этап: подтверждение правил и обработка документа
 * Получает jobId и опционально отредактированные правила
 */
export async function POST(request: NextRequest) {
  let jobId: string | undefined;

  try {
    const body = await request.json();
    jobId = body.jobId;
    const updatedRules = body.rules as FormattingRules | undefined;

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId обязателен" },
        { status: 400 }
      );
    }

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "Задача не найдена" },
        { status: 404 }
      );
    }

    if (job.status !== "awaiting_confirmation") {
      return NextResponse.json(
        { error: `Задача в неверном статусе: ${job.status}` },
        { status: 400 }
      );
    }

    if (!job.sourceDocumentId) {
      return NextResponse.json(
        { error: "Исходный документ не найден в задаче" },
        { status: 400 }
      );
    }

    // Определяем тип доступа пользователя для обрезки trial
    let userAccessType: AccessType = "trial";
    if (job.userId) {
      const access = await getUserAccess(job.userId);
      userAccessType = access.accessType;
    }
    // Анонимные (userId === null) остаются "trial"

    // Используем обновлённые правила или сохранённые ранее
    const rules = updatedRules || job.rules;
    if (!rules) {
      return NextResponse.json(
        { error: "Правила форматирования не найдены" },
        { status: 400 }
      );
    }

    await updateJobProgress(jobId, "analyzing", 50, "Получение исходного документа");

    // Получаем исходный документ из хранилища
    const sourceBuffer = await getFile(job.sourceDocumentId);
    if (!sourceBuffer) {
      await failJob(jobId, "Не удалось получить исходный документ");
      return NextResponse.json(
        { error: "Не удалось получить исходный документ" },
        { status: 500 }
      );
    }

    // Парсим структуру и размечаем блоки через AI
    await updateJobProgress(jobId, "analyzing", 55, "AI-разметка блоков документа");
    const docxStructure = await parseDocxStructure(sourceBuffer);
    const enrichedParagraphs = await enrichWithBlockMarkup(docxStructure.paragraphs);

    // Анализируем документ
    await updateJobProgress(jobId, "analyzing", 65, "Проверка документа на соответствие требованиям");
    const analysisResult = await analyzeDocument(sourceBuffer, rules, enrichedParagraphs);

    await updateJobProgress(jobId, "formatting", 75, "Применение форматирования через XML");

    // Форматируем документ через XML-модификацию (сохраняет картинки и таблицы)
    // Для trial — обрезка до 30 страниц происходит ПОСЛЕ форматирования
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
      console.log(`[confirm-rules] Saved full versions for job ${jobId} (hook-offer)`);
    }

    // Добавляем информацию об обрезке в статистику (если была)
    const statistics = {
      ...analysisResult.statistics,
      ...(formattingResult.wasTruncated && {
        wasTruncated: true,
        originalPageCount: formattingResult.originalPageCount,
        pageLimitApplied: LAVA_CONFIG.freeTrialMaxPages,
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

    return NextResponse.json({
      jobId,
      status: "completed",
      statistics,
      violationsCount: analysisResult.violations.length,
    });

  } catch (error) {
    console.error("Confirm rules error:", error);

    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";

    // КРИТИЧЕСКИЙ FIX: помечаем job как failed, чтобы не зависал навечно
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
