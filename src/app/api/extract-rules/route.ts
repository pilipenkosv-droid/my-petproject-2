import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { saveFile } from "@/lib/storage/file-storage";
import { createJob, updateJobProgress, updateJob, failJob } from "@/lib/storage/job-store";
import { extractText, isValidSourceDocument, isValidRequirementsDocument, getMimeTypeByExtension } from "@/lib/pipeline/text-extractor";
import { parseFormattingRules, mergeWithDefaults } from "@/lib/ai/provider";

export const maxDuration = 60;

/**
 * Первый этап: извлечение правил форматирования из методички
 * После этого пользователь может просмотреть и отредактировать правила
 */
export async function POST(request: NextRequest) {
  const jobId = nanoid();
  
  try {
    createJob(jobId);
    updateJobProgress(jobId, "uploading", 5, "Получение файлов");

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

    const sourceMimeType = sourceFile.type || getMimeTypeByExtension(sourceFile.name) || "";
    const requirementsMimeType = requirementsFile.type || getMimeTypeByExtension(requirementsFile.name) || "";

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

    // Сохраняем ID файлов в job для последующей обработки
    updateJob(jobId, {
      sourceDocumentId: savedSource.id,
      requirementsDocumentId: savedRequirements.id,
    });

    updateJobProgress(jobId, "extracting_text", 20, "Извлечение текста из методички");

    const requirementsText = await extractText(requirementsBuffer, requirementsMimeType);

    if (!requirementsText || requirementsText.trim().length < 50) {
      failJob(jobId, "Документ с требованиями слишком короткий или пустой");
      return NextResponse.json(
        { error: "Документ с требованиями слишком короткий или пустой" },
        { status: 400 }
      );
    }

    updateJobProgress(jobId, "parsing_rules", 50, "Анализ требований форматирования с помощью AI");

    const aiResponse = await parseFormattingRules(requirementsText);
    const rules = mergeWithDefaults(aiResponse.rules);

    // Сохраняем правила в job и переводим в статус ожидания подтверждения
    updateJob(jobId, {
      status: "awaiting_confirmation",
      progress: 100,
      statusMessage: "Правила извлечены, ожидается подтверждение",
      rules,
    });

    return NextResponse.json({
      jobId,
      status: "awaiting_confirmation",
      rules,
      confidence: aiResponse.confidence,
      warnings: aiResponse.warnings,
      missingRules: aiResponse.missingRules,
    });

  } catch (error) {
    console.error("Extract rules error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
    failJob(jobId, errorMessage);

    return NextResponse.json(
      { error: errorMessage, jobId },
      { status: 500 }
    );
  }
}
