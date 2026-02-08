/**
 * API: Проверка грамматики через LanguageTool
 * POST { text, language? }
 * Без авторизации — бесплатный инструмент
 */

import { NextRequest, NextResponse } from "next/server";
import { checkGrammar } from "@/lib/grammar/language-tool";

export const maxDuration = 60; // чанки больших текстов могут занять время

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, language = "ru-RU" } = body as {
      text?: string;
      language?: string;
    };

    // Валидация текста
    if (!text?.trim()) {
      return NextResponse.json(
        { error: "Текст обязателен для проверки" },
        { status: 400 }
      );
    }

    if (text.trim().length < 10) {
      return NextResponse.json(
        { error: "Текст слишком короткий (минимум 10 символов)" },
        { status: 400 }
      );
    }

    if (text.trim().length > 100_000) {
      return NextResponse.json(
        { error: "Текст слишком длинный (максимум 100 000 символов)" },
        { status: 400 }
      );
    }

    const result = await checkGrammar(text.trim(), language);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Grammar check error:", error);

    if (error instanceof Error && error.message.includes("429")) {
      return NextResponse.json(
        { error: "Превышен лимит запросов. Подождите минуту и попробуйте снова." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Ошибка при проверке грамматики. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
