import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/gateway";
import {
  OUTLINE_GENERATION_SYSTEM_PROMPT,
  createOutlinePrompt,
} from "@/lib/ai/prompts";

export const maxDuration = 30;

/**
 * Генерация плана/структуры академической работы.
 * Бесплатный инструмент, без авторизации.
 *
 * POST { topic, workType, subject?, additionalRequirements? }
 * → { outline: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, workType, subject, additionalRequirements } = body as {
      topic: string;
      workType: string;
      subject?: string;
      additionalRequirements?: string;
    };

    if (!topic?.trim()) {
      return NextResponse.json(
        { error: "Укажите тему работы" },
        { status: 400 }
      );
    }

    if (topic.trim().length < 5) {
      return NextResponse.json(
        { error: "Тема слишком короткая (минимум 5 символов)" },
        { status: 400 }
      );
    }

    if (topic.trim().length > 500) {
      return NextResponse.json(
        { error: "Тема слишком длинная (максимум 500 символов)" },
        { status: 400 }
      );
    }

    if (!workType?.trim()) {
      return NextResponse.json(
        { error: "Укажите тип работы" },
        { status: 400 }
      );
    }

    const userPrompt = createOutlinePrompt(
      topic.trim(),
      workType.trim(),
      subject?.trim(),
      additionalRequirements?.trim()
    );

    const response = await callAI({
      systemPrompt: OUTLINE_GENERATION_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
      maxTokens: 4096,
      textMode: true,
    });

    const outline = response.json as string;

    return NextResponse.json({ outline });
  } catch (error) {
    console.error("[generate-outline] Error:", error);

    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
