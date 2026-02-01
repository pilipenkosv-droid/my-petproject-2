import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { saveFile, saveResultFile } from "@/lib/storage/file-storage";
import { createJob, updateJobProgress, completeJob, failJob } from "@/lib/storage/job-store";
import { extractText, isValidSourceDocument, isValidRequirementsDocument, getMimeTypeByExtension } from "@/lib/pipeline/text-extractor";
import { parseFormattingRules, mergeWithDefaults } from "@/lib/ai/provider";
import { analyzeDocument, parseDocxStructure, enrichWithBlockMarkup } from "@/lib/pipeline/document-analyzer";
import { formatDocument } from "@/lib/pipeline/document-formatter";

export const maxDuration = 60; // Максимальное время выполнения для Vercel

export async function POST(request: NextRequest) {
  const jobId = nanoid();
  
  try {
    // Создаём задачу
    createJob(jobId);
    updateJobProgress(jobId, "uploading", 5, "Получение файлов");

    // Получаем файлы из FormData
    const formData = await request.formData();
    const sourceFile = formData.get("sourceDocument") as File | null;
    const requirementsFile = formData.get("requirementsDocument") as File | null;

    if (!sourceFile || !requirementsFile) {
      failJob(jobId, "Необходимо загрузить оба файла");
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
      failJob(jobId, "Исходный документ должен быть в формате .docx");
      return NextResponse.json(
        { error: "Исходный документ должен быть в формате .docx" },
        { status: 400 }
      );
    }

    if (!isValidRequirementsDocument(requirementsMimeType)) {
      failJob(jobId, "Документ с требованиями должен быть в формате .docx, .pdf или .txt");
      return NextResponse.json(
        { error: "Документ с требованиями должен быть в формате .docx, .pdf или .txt" },
        { status: 400 }
      );
    }

    updateJobProgress(jobId, "uploading", 10, "Сохранение файлов");

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

    updateJobProgress(jobId, "extracting_text", 20, "Извлечение текста из документов");

    // Извлекаем текст из документа с требованиями
    const requirementsText = await extractText(requirementsBuffer, requirementsMimeType);

    if (!requirementsText || requirementsText.trim().length < 50) {
      failJob(jobId, "Документ с требованиями слишком короткий или пустой");
      return NextResponse.json(
        { error: "Документ с требованиями слишком короткий или пустой" },
        { status: 400 }
      );
    }

    updateJobProgress(jobId, "parsing_rules", 35, "Анализ требований форматирования с помощью AI");

    // Парсим правила форматирования через AI
    const aiResponse = await parseFormattingRules(requirementsText);
    const rules = mergeWithDefaults(aiResponse.rules);

    updateJobProgress(jobId, "analyzing", 50, "AI-разметка блоков документа");

    // Парсим структуру и размечаем блоки через AI
    const docxStructure = await parseDocxStructure(sourceBuffer);
    const enrichedParagraphs = await enrichWithBlockMarkup(docxStructure.paragraphs);

    updateJobProgress(jobId, "analyzing", 60, "Проверка документа на соответствие требованиям");

    // Анализируем документ
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
      warnings: aiResponse.warnings,
    });

  } catch (error) {
    console.error("Processing error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
    failJob(jobId, errorMessage);

    return NextResponse.json(
      { error: errorMessage, jobId },
      { status: 500 }
    );
  }
}
