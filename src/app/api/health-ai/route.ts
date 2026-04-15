/**
 * Diagnostic endpoint to verify AI model availability.
 * Tests each model individually (bypasses cascading in callAI).
 * DELETE THIS FILE after verification.
 */
import { NextResponse } from "next/server";
import { getAvailableModels, type ModelConfig } from "@/lib/ai/model-registry";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import OpenAI from "openai";

export const maxDuration = 30;

async function testModel(model: ModelConfig): Promise<{
  id: string;
  displayName: string;
  available: boolean;
  responseTime: number;
  response?: string;
  error?: string;
}> {
  const start = Date.now();
  const apiKey = process.env[model.apiKeyEnv];

  if (!apiKey) {
    return {
      id: model.id,
      displayName: model.displayName,
      available: false,
      responseTime: 0,
      error: `ENV ${model.apiKeyEnv} not set`,
    };
  }

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: model.baseUrl,
      timeout: 15000,
    });

    const resp = await openai.chat.completions.create({
      model: model.modelId,
      messages: [
        { role: "system", content: "Reply with exactly one word: OK" },
        { role: "user", content: "ping" },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const content = resp.choices[0]?.message?.content || "";

    return {
      id: model.id,
      displayName: model.displayName,
      available: true,
      responseTime: Date.now() - start,
      response: content.trim(),
    };
  } catch (error) {
    return {
      id: model.id,
      displayName: model.displayName,
      available: false,
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reset = url.searchParams.get("reset") === "1";

  const models = getAvailableModels();

  // Optionally reset rate limiter blocks
  if (reset) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from("rate_limits")
      .update({
        consecutive_errors: 0,
        blocked_until: 0,
        minute_requests: 0,
        day_requests: 0,
      })
      .neq("model_id", "");
  }

  // Get rate limiter state
  const supabase = getSupabaseAdmin();
  const { data: rateLimits } = await supabase
    .from("rate_limits")
    .select("*");

  // Test each model directly (not through callAI cascade)
  const results = await Promise.all(models.map(testModel));

  const anyAvailable = results.some((r) => r.available);

  return NextResponse.json({
    status: anyAvailable ? "ok" : "error",
    modelsConfigured: models.length,
    results,
    rateLimits: rateLimits || [],
    envKeys: {
      AI_GATEWAY_API_KEY: !!process.env.AI_GATEWAY_API_KEY,
      AITUNNEL_API_KEY: !!process.env.AITUNNEL_API_KEY,
    },
    resetDone: reset,
  });
}
