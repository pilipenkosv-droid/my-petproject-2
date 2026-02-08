/**
 * API: Суммаризация текста с помощью AI
 * POST { text, targetLength? }
 * Без авторизации — бесплатный инструмент
 */

import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/gateway";
import { SUMMARIZER_SYSTEM_PROMPT, createSummarizerPrompt } from "@/lib/ai/prompts";

export const maxDuration = 30;

const VALID_LENGTHS = ["short", "medium", "detailed"] as const;
type TargetLength = (typeof VALID_LENGTHS)[number];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, targetLength = "medium" } = body as {
      text?: string;
      targetLength?: string;
    };

    // Валидация текста
    if (!text?.trim()) {
      return NextResponse.json(
        { error: "Текст обязателен для суммаризации" },
        { status: 400 }
      );
    }

    if (text.trim().length < 50) {
      return NextResponse.json(
        { error: "Текст слишком короткий (минимум 50 символов)" },
        { status: 400 }
      );
    }

    if (text.trim().length > 50000) {
      return NextResponse.json(
        { error: "Текст слишком длинный (максимум 50 000 символов)" },
        { status: 400 }
      );
    }

    // Валидация длины
    const validLength: TargetLength = VALID_LENGTHS.includes(targetLength as TargetLength)
      ? (targetLength as TargetLength)
      : "medium";

    // Генерация резюме
    const userPrompt = createSummarizerPrompt(text.trim(), validLength);

    const response = await callAI({
      systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 2048,
      textMode: true,
    });

    const summary = response.json as string;

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "Ошибка при генерации резюме. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
