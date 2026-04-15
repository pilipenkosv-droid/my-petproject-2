/**
 * Diagnostic endpoint to verify AI model availability.
 * Tests: raw fetch + OpenAI SDK for each model.
 * DELETE THIS FILE after verification.
 */
import { NextResponse } from "next/server";
import { getAvailableModels, type ModelConfig } from "@/lib/ai/model-registry";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import OpenAI from "openai";

export const maxDuration = 30;

async function testRawFetch(baseUrl: string, modelId: string, apiKey: string): Promise<{
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
  responseTime: number;
}> {
  const start = Date.now();
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await resp.text();
    return {
      ok: resp.ok,
      status: resp.status,
      body: text.slice(0, 500),
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      responseTime: Date.now() - start,
    };
  }
}

async function testModelSDK(model: ModelConfig): Promise<{
  ok: boolean;
  response?: string;
  error?: string;
  responseTime: number;
}> {
  const start = Date.now();
  const apiKey = process.env[model.apiKeyEnv];
  if (!apiKey) return { ok: false, error: "no key", responseTime: 0 };

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: model.baseUrl,
      timeout: 15000,
    });
    const resp = await openai.chat.completions.create({
      model: model.modelId,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
      temperature: 0,
    });
    return {
      ok: true,
      response: resp.choices[0]?.message?.content?.slice(0, 100) || "",
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      responseTime: Date.now() - start,
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
      .update({ consecutive_errors: 0, blocked_until: 0, minute_requests: 0, day_requests: 0 })
      .neq("model_id", "");
  }

  const supabase = getSupabaseAdmin();
  const { data: rateLimits } = await supabase
    .from("rate_limits")
    .select("model_id, consecutive_errors, blocked_until")
    .in("model_id", ["vercel-gemini-flash", "aitunnel-gemini-flash"]);

  const results = await Promise.all(
    models.map(async (model) => {
      const apiKey = process.env[model.apiKeyEnv];
      if (!apiKey || !model.baseUrl) {
        return { id: model.id, rawFetch: { ok: false, error: "no key or baseUrl", responseTime: 0 }, sdk: { ok: false, error: "no key", responseTime: 0 } };
      }

      const [rawFetch, sdk] = await Promise.all([
        testRawFetch(model.baseUrl, model.modelId, apiKey),
        testModelSDK(model),
      ]);

      return { id: model.id, displayName: model.displayName, rawFetch, sdk };
    })
  );

  const anyAvailable = results.some((r) => r.rawFetch.ok || r.sdk.ok);

  return NextResponse.json({
    status: anyAvailable ? "ok" : "error",
    nodeVersion: process.version,
    results,
    rateLimits: rateLimits || [],
    envKeys: {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY ? `${process.env.AI_GATEWAY_API_KEY.slice(0, 8)}...` : "NOT SET",
      AITUNNEL_API_KEY: process.env.AITUNNEL_API_KEY ? `${process.env.AITUNNEL_API_KEY.slice(0, 8)}...` : "NOT SET",
    },
    resetDone: reset,
  });
}
