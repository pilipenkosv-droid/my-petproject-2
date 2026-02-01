import { NextRequest, NextResponse } from "next/server";
import { getJobAsync, updateJobAsync, updateJobProgress, completeJob, failJob } from "@/lib/storage/job-store";
import { getFile } from "@/lib/storage/file-storage";
import { saveResultFile } from "@/lib/storage/file-storage";
import { analyzeDocument, parseDocxStructure, enrichWithBlockMarkup } from "@/lib/pipeline/document-analyzer";
import { formatDocument } from "@/lib/pipeline/document-formatter";
import { FormattingRules } from "@/types/formatting-rules";

export const maxDuration = 60;

/**
 * Второй этап: подтверждение правил и обработка документа
 * Получает jobId и опционально отредактированные правила
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, rules: updatedRules } = body as {
      jobId: string;
      rules?: FormattingRules;
    };

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId обязателен" },
        { status: 400 }
      );
    }

    const job = await getJobAsync(jobId);
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

    // Используем обновлённые правила или сохранённые ранее
    const rules = updatedRules || job.rules;
    if (!rules) {
      return NextResponse.json(
        { error: "Правила форматирования не найдены" },
        { status: 400 }
      );
    }

    updateJobProgress(jobId, "analyzing", 50, "Получение исходного документа");

    // Получаем исходный документ из хранилища
    const sourceBuffer = await getFile(job.sourceDocumentId);
    if (!sourceBuffer) {
      failJob(jobId, "Не удалось получить исходный документ");
      return NextResponse.json(
        { error: "Не удалось получить исходный документ" },
        { status: 500 }
      );
    }

    // Парсим структуру и размечаем блоки через AI
    updateJobProgress(jobId, "analyzing", 55, "AI-разметка блоков документа");
    const docxStructure = await parseDocxStructure(sourceBuffer);
    const enrichedParagraphs = await enrichWithBlockMarkup(docxStructure.paragraphs);

    // Анализируем документ
    updateJobProgress(jobId, "analyzing", 65, "Проверка документа на соответствие требованиям");
    const analysisResult = await analyzeDocument(sourceBuffer, rules, enrichedParagraphs);

    updateJobProgress(jobId, "formatting", 75, "Применение форматирования через XML");

    // Форматируем документ через XML-модификацию (сохраняет картинки и таблицы)
    const formattingResult = await formatDocument(sourceBuffer, rules, analysisResult.violations, enrichedParagraphs);

    updateJobProgress(jobId, "formatting", 90, "Сохранение результатов");

    // Сохраняем результаты
    await saveResultFile(jobId, "original", formattingResult.markedOriginal);
    await saveResultFile(jobId, "formatted", formattingResult.formattedDocument);

    // Завершаем задачу
    completeJob(jobId, {
      markedOriginalId: `${jobId}_original`,
      formattedDocumentId: `${jobId}_formatted`,
      violations: analysisResult.violations,
      statistics: analysisResult.statistics,
      rules,
    });

    return NextResponse.json({
      jobId,
      status: "completed",
      statistics: analysisResult.statistics,
      violationsCount: analysisResult.violations.length,
    });

  } catch (error) {
    console.error("Confirm rules error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
