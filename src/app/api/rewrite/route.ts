/**
 * API: Рерайт текста для повышения уникальности
 * POST { text, mode?, preserveTerms? }
 * Без авторизации — бесплатный инструмент
 */

import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/gateway";
import { REWRITE_SYSTEM_PROMPT, createRewritePrompt } from "@/lib/ai/prompts";

export const maxDuration = 30;

const VALID_MODES = ["light", "medium", "heavy"] as const;
type RewriteMode = (typeof VALID_MODES)[number];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, mode = "medium", preserveTerms } = body as {
      text?: string;
      mode?: string;
      preserveTerms?: string;
    };

    // Валидация текста
    if (!text?.trim()) {
      return NextResponse.json(
        { error: "Текст обязателен для рерайта" },
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

    // Валидация режима
    const validMode: RewriteMode = VALID_MODES.includes(mode as RewriteMode)
      ? (mode as RewriteMode)
      : "medium";

    // Парсинг терминов
    const terms = preserveTerms
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Генерация рерайта
    const userPrompt = createRewritePrompt(text.trim(), validMode, terms);

    const response = await callAI({
      systemPrompt: REWRITE_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
      maxTokens: 8192,
      textMode: true,
    });

    const rewritten = response.json as string;

    return NextResponse.json({ rewritten });
  } catch (error) {
    console.error("Rewrite error:", error);
    return NextResponse.json(
      { error: "Ошибка при рерайте текста. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
