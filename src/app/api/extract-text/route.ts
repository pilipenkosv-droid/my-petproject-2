/**
 * API: Извлечение текста из загруженных файлов (.docx, .pdf, .txt)
 * POST FormData с полем "file"
 * Без авторизации — используется бесплатными инструментами
 */

import { NextRequest, NextResponse } from "next/server";
import { extractTextFromDocx } from "@/lib/documents/docx-reader";
import { extractTextFromPdf } from "@/lib/documents/pdf-reader";
import { extractTextFromTxt } from "@/lib/documents/txt-reader";

export const maxDuration = 15;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Файл не загружен" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Файл слишком большой (максимум 10 MB)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase();
    const mimeType = file.type || "";

    let text: string;

    if (mimeType.includes("wordprocessingml") || ext === "docx") {
      text = await extractTextFromDocx(buffer);
    } else if (mimeType.includes("pdf") || ext === "pdf") {
      text = await extractTextFromPdf(buffer);
    } else if (mimeType.includes("text") || ext === "txt") {
      text = await extractTextFromTxt(buffer);
    } else {
      return NextResponse.json(
        { error: "Неподдерживаемый формат файла. Допустимые: .docx, .pdf, .txt" },
        { status: 400 }
      );
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Не удалось извлечь текст из файла. Возможно, файл пуст или повреждён." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text: text.trim(),
      charCount: text.trim().length,
    });
  } catch (error) {
    console.error("Extract text error:", error);
    return NextResponse.json(
      { error: "Ошибка при извлечении текста из файла" },
      { status: 500 }
    );
  }
}
