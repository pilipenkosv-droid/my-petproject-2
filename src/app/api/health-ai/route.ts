/**
 * Diagnostic endpoint to verify AI model availability.
 * Tests each model individually + raw HTTP connectivity.
 * DELETE THIS FILE after verification.
 */
import { NextResponse } from "next/server";
import { getAvailableModels, type ModelConfig } from "@/lib/ai/model-registry";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import OpenAI from "openai";

export const maxDuration = 30;

async function testConnectivity(url: string, apiKey: string): Promise<{
  reachable: boolean;
  status?: number;
  error?: string;
  responseTime: number;
}> {
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    return {
      reachable: true,
      status: resp.status,
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
      responseTime: Date.now() - start,
    };
  }
}

async function testModel(model: ModelConfig): Promise<{
  id: string;
  displayName: string;
  available: boolean;
  responseTime: number;
  response?: string;
  error?: string;
  connectivity?: { reachable: boolean; status?: number; error?: string };
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

  // First test raw connectivity
  const connectivityUrl = model.baseUrl
    ? `${model.baseUrl}/models`
    : "https://generativelanguage.googleapis.com/v1beta/models";
  const connectivity = await testConnectivity(connectivityUrl, apiKey);

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
      connectivity,
    };
  } catch (error) {
    return {
      id: model.id,
      displayName: model.displayName,
      available: false,
      responseTime: Date.now() - start,
      error: error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error),
      connectivity,
    };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reset = url.searchParams.get("reset") === "1";

  const models = getAvailableModels();

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

  const supabase = getSupabaseAdmin();
  const { data: rateLimits } = await supabase
    .from("rate_limits")
    .select("model_id, consecutive_errors, blocked_until, minute_requests, day_requests");

  const results = await Promise.all(models.map(testModel));
  const anyAvailable = results.some((r) => r.available);

  return NextResponse.json({
    status: anyAvailable ? "ok" : "error",
    modelsConfigured: models.length,
    results,
    rateLimits: (rateLimits || []).filter(r =>
      r.model_id === "vercel-gemini-flash" || r.model_id === "aitunnel-gemini-flash"
    ),
    envKeys: {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY ? `${process.env.AI_GATEWAY_API_KEY.slice(0, 6)}...` : "NOT SET",
      AITUNNEL_API_KEY: process.env.AITUNNEL_API_KEY ? `${process.env.AITUNNEL_API_KEY.slice(0, 6)}...` : "NOT SET",
    },
    resetDone: reset,
  });
}
