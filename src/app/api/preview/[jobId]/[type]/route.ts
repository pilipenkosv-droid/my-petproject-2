import { NextRequest, NextResponse } from "next/server";
import { getResultFile } from "@/lib/storage/file-storage";
import mammoth from "mammoth";

/**
 * API для получения HTML-превью документа
 * Конвертирует DOCX в HTML с помощью mammoth.js
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; type: string }> }
) {
  const { jobId, type } = await params;
  
  // Валидация типа
  if (type !== "original" && type !== "formatted") {
    return NextResponse.json(
      { error: "Неверный тип документа. Допустимые значения: original, formatted" },
      { status: 400 }
    );
  }

  try {
    // Получаем документ из хранилища
    const docBuffer = await getResultFile(jobId, type as "original" | "formatted");
    
    if (!docBuffer) {
      return NextResponse.json(
        { error: "Документ не найден" },
        { status: 404 }
      );
    }

    // Конвертируем DOCX в HTML с помощью mammoth
    const result = await mammoth.convertToHtml(
      { buffer: docBuffer },
      {
        // Настройки конвертации для лучшего отображения
        styleMap: [
          // Заголовки
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          // Сохраняем выделение (подсветка)
          "r[style-name='Highlight'] => mark",
          // Курсив и жирный
          "b => strong",
          "i => em",
        ],
        // Включаем встроенные стили для подсветки
        includeDefaultStyleMap: true,
      }
    );

    // Обрабатываем HTML для улучшения отображения
    let html = result.value;
    
    // Добавляем классы для ошибок и исправлений (если есть хайлайты в документе)
    if (type === "original") {
      // Подсвечиваем ошибки красным
      html = html.replace(
        /<mark>/g,
        '<mark class="error">'
      );
    } else {
      // Подсвечиваем исправления зелёным
      html = html.replace(
        /<mark>/g,
        '<mark class="success">'
      );
    }

    // Добавляем базовую обёртку для стилей
    html = `<div class="document-content">${html}</div>`;

    // Возвращаем HTML и предупреждения mammoth (если есть)
    return NextResponse.json({
      html,
      warnings: result.messages.filter(m => m.type === "warning").map(m => m.message),
    });

  } catch (error) {
    console.error("Preview generation error:", error);
    
    return NextResponse.json(
      { error: "Ошибка при генерации превью" },
      { status: 500 }
    );
  }
}
