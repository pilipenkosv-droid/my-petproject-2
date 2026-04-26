/**
 * Генерация плана/структуры академической работы.
 *
 * POST { topic, workType, subject?, additionalRequirements? }
 * → { outline: string, truncated, ... }
 *
 * Tier-логика (Stage 2A paywall): см. /api/rewrite/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/gateway";
import {
  OUTLINE_GENERATION_SYSTEM_PROMPT,
  createOutlinePrompt,
} from "@/lib/ai/prompts";
import {
  createSupabaseServer,
  getSupabaseAdmin,
} from "@/lib/supabase/server";
import { getToolAccess, consumeToolUse } from "@/lib/auth/tool-access";
import { truncateOutline } from "@/lib/ai/truncate-output";

export const maxDuration = 30;

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

    // Tier check
    const supabaseAuth = await createSupabaseServer();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    const userId = user?.id ?? null;
    const access = await getToolAccess(userId);

    if (access.tier === "pro" && access.toolUsesRemaining === 0) {
      return NextResponse.json(
        {
          error: "tool_quota_exceeded",
          message: "Лимит 50 использований в месяц исчерпан",
        },
        { status: 402 }
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

    if (!access.shouldTruncate) {
      if (access.tier === "pro" && userId) {
        await consumeToolUse(userId, "outline");
      }
      return NextResponse.json({ outline, truncated: false });
    }

    let outputId: string | null = null;
    try {
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
        .from("tool_outputs")
        .insert({ tool: "outline", full_output: outline })
        .select("id")
        .single();

      if (error) {
        console.error(
          "[generate-outline] tool_outputs insert failed:",
          error.message
        );
      } else {
        outputId = (data as { id: string }).id;
      }
    } catch (err) {
      console.error("[generate-outline] tool_outputs insert exception:", err);
    }

    const { truncated, hiddenSections } = truncateOutline(outline, 50);

    return NextResponse.json({
      outline: truncated,
      truncated: true,
      outputId,
      hiddenSections,
    });
  } catch (error) {
    console.error("[generate-outline] Error:", error);

    return NextResponse.json(
      {
        error:
          "Извините, сервис временно недоступен. Мы уже работаем над этим. Попробуйте через пару минут.",
      },
      { status: 503 }
    );
  }
}
