/**
 * API: Рерайт текста для повышения уникальности
 * POST { text, mode?, preserveTerms? }
 *
 * Tier-логика (Stage 2A paywall):
 * - anon/free → возвращаем 50% результата + сохраняем полный в tool_outputs
 * - pro → полный результат, списываем 1 из месячной квоты
 * - admin → полный результат, без списания
 * - pro с исчерпанной квотой → 402 tool_quota_exceeded
 */

import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/gateway";
import { REWRITE_SYSTEM_PROMPT, createRewritePrompt } from "@/lib/ai/prompts";
import {
  createSupabaseServer,
  getSupabaseAdmin,
} from "@/lib/supabase/server";
import { getToolAccess, consumeToolUse } from "@/lib/auth/tool-access";
import { truncateText } from "@/lib/ai/truncate-output";

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

    const validMode: RewriteMode = VALID_MODES.includes(mode as RewriteMode)
      ? (mode as RewriteMode)
      : "medium";

    const terms = preserveTerms
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean);

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

    const userPrompt = createRewritePrompt(text.trim(), validMode, terms);

    const response = await callAI({
      systemPrompt: REWRITE_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
      maxTokens: 8192,
      textMode: true,
    });

    const rewritten = response.json as string;

    if (!access.shouldTruncate) {
      // pro / admin
      if (access.tier === "pro" && userId) {
        await consumeToolUse(userId, "rewrite");
      }
      return NextResponse.json({ rewritten, truncated: false });
    }

    // anon / free → store full + return truncated
    let outputId: string | null = null;
    try {
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
        .from("tool_outputs")
        .insert({ tool: "rewrite", full_output: rewritten })
        .select("id")
        .single();

      if (error) {
        console.error("[rewrite] tool_outputs insert failed:", error.message);
      } else {
        outputId = (data as { id: string }).id;
      }
    } catch (err) {
      console.error("[rewrite] tool_outputs insert exception:", err);
    }

    const { truncated, hiddenChars } = truncateText(rewritten, 50);

    return NextResponse.json({
      rewritten: truncated,
      truncated: true,
      outputId,
      hiddenChars,
    });
  } catch (error) {
    console.error("Rewrite error:", error);
    return NextResponse.json(
      { error: "Ошибка при рерайте текста. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
