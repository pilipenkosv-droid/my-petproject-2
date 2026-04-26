/**
 * API: Суммаризация текста с помощью AI
 * POST { text, targetLength? }
 *
 * Tier-логика (Stage 2A paywall): см. /api/rewrite/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/gateway";
import {
  SUMMARIZER_SYSTEM_PROMPT,
  createSummarizerPrompt,
} from "@/lib/ai/prompts";
import {
  createSupabaseServer,
  getSupabaseAdmin,
} from "@/lib/supabase/server";
import { getToolAccess, consumeToolUse } from "@/lib/auth/tool-access";
import { truncateText } from "@/lib/ai/truncate-output";

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

    const validLength: TargetLength = VALID_LENGTHS.includes(
      targetLength as TargetLength
    )
      ? (targetLength as TargetLength)
      : "medium";

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

    const userPrompt = createSummarizerPrompt(text.trim(), validLength);

    const response = await callAI({
      systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 2048,
      textMode: true,
    });

    const summary = response.json as string;

    if (!access.shouldTruncate) {
      if (access.tier === "pro" && userId) {
        await consumeToolUse(userId, "summarize");
      }
      return NextResponse.json({ summary, truncated: false });
    }

    let outputId: string | null = null;
    try {
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
        .from("tool_outputs")
        .insert({ tool: "summarize", full_output: summary })
        .select("id")
        .single();

      if (error) {
        console.error("[summarize] tool_outputs insert failed:", error.message);
      } else {
        outputId = (data as { id: string }).id;
      }
    } catch (err) {
      console.error("[summarize] tool_outputs insert exception:", err);
    }

    const { truncated, hiddenChars } = truncateText(summary, 50);

    return NextResponse.json({
      summary: truncated,
      truncated: true,
      outputId,
      hiddenChars,
    });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "Ошибка при генерации резюме. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
