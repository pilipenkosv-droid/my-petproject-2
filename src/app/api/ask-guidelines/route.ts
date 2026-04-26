import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/storage/job-store";
import { callAI } from "@/lib/ai/gateway";
import {
  GUIDELINES_CHAT_SYSTEM_PROMPT,
  createGuidelinesChatPrompt,
} from "@/lib/ai/prompts";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getToolAccess, consumeToolUse } from "@/lib/auth/tool-access";
import { FREE_TOOL_QUESTIONS } from "@/lib/payment/config";

export const maxDuration = 30;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Чат с методичкой — отвечает на вопросы по тексту загруженной методички.
 *
 * POST { jobId, question, history?: ChatMessage[] }
 * → { answer: string, gated: false, questionsRemaining?: number }
 *   | 402 { error: "ask_quota_exceeded" | "tool_quota_exceeded", ... }
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

    // Tier-gate: anon/free → 2 свободных вопроса на jobId; pro → квота 50/мес.
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    const access = await getToolAccess(userId);

    if (access.tier === "pro" || access.tier === "admin") {
      if (access.tier === "pro" && access.toolUsesRemaining === 0) {
        return NextResponse.json(
          {
            error: "tool_quota_exceeded",
            message: "Лимит 50 использований в месяц исчерпан",
          },
          { status: 402 }
        );
      }
    } else {
      // anon/free: считаем сколько вопросов user уже задал в этом jobId.
      // Источник истины — клиентский history. Это soft-gate: клиент может
      // подделать счётчик, но цена обхода = 1 лишний LLM-вызов; жёсткой
      // защитой будет миграция чата в БД (v2).
      const userQuestionsInHistory = (history ?? []).filter(
        (m) => m?.role === "user"
      ).length;

      if (userQuestionsInHistory >= FREE_TOOL_QUESTIONS) {
        return NextResponse.json(
          {
            error: "ask_quota_exceeded",
            reason: "free_limit",
            limit: FREE_TOOL_QUESTIONS,
            message:
              "Бесплатно доступно 2 вопроса. Оформи Pro для безлимитного чата.",
          },
          { status: 402 }
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

      return NextResponse.json({
        answer,
        gated: false,
        questionsRemaining: FREE_TOOL_QUESTIONS - userQuestionsInHistory - 1,
      });
    }

    // Pro/admin path
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

    if (access.tier === "pro" && userId) {
      await consumeToolUse(userId, "ask-guidelines");
    }

    return NextResponse.json({ answer, gated: false });
  } catch (error) {
    console.error("[ask-guidelines] Error:", error);

    return NextResponse.json(
      { error: "Извините, сервис временно недоступен. Мы уже работаем над этим. Попробуйте через пару минут." },
      { status: 503 }
    );
  }
}
