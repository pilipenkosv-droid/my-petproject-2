import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/storage/job-store";
import { callAI } from "@/lib/ai/gateway";
import {
  GUIDELINES_CHAT_SYSTEM_PROMPT,
  createGuidelinesChatPrompt,
} from "@/lib/ai/prompts";

export const maxDuration = 30;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Чат с методичкой — отвечает на вопросы по тексту загруженной методички.
 *
 * POST { jobId, question, history?: ChatMessage[] }
 * → { answer: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, question, history } = body as {
      jobId: string;
      question: string;
      history?: ChatMessage[];
    };

    if (!jobId || !question?.trim()) {
      return NextResponse.json(
        { error: "jobId и question обязательны" },
        { status: 400 }
      );
    }

    if (question.trim().length > 1000) {
      return NextResponse.json(
        { error: "Вопрос слишком длинный (максимум 1000 символов)" },
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

    if (!job.guidelinesText) {
      return NextResponse.json(
        { error: "Текст методички не найден для этой задачи" },
        { status: 400 }
      );
    }

    // Ограничиваем историю последними 10 сообщениями
    const recentHistory = history?.slice(-10);

    const userPrompt = createGuidelinesChatPrompt(
      question.trim(),
      job.guidelinesText,
      recentHistory
    );

    const response = await callAI({
      systemPrompt: GUIDELINES_CHAT_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
      maxTokens: 2048,
      textMode: true,
    });

    const answer = response.json as string;

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("[ask-guidelines] Error:", error);

    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
