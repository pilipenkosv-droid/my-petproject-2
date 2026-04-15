/**
 * Diagnostic endpoint to verify AI model availability.
 * Uses raw fetch (not OpenAI SDK) to match gateway implementation.
 * DELETE THIS FILE after verification.
 */
import { NextResponse } from "next/server";
import { getAvailableModels, type ModelConfig } from "@/lib/ai/model-registry";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai/gateway";

export const maxDuration = 30;

async function testRawFetch(model: ModelConfig): Promise<{
  ok: boolean;
  status?: number;
  response?: string;
  error?: string;
  responseTime: number;
}> {
  const start = Date.now();
  const apiKey = process.env[model.apiKeyEnv];
  if (!apiKey || !model.baseUrl) {
    return { ok: false, error: "no key or baseUrl", responseTime: 0 };
  }

  try {
    const resp = await fetch(`${model.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, error: errText.slice(0, 200), responseTime: Date.now() - start };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return { ok: true, status: resp.status, response: content.slice(0, 100), responseTime: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      responseTime: Date.now() - start,
    };
  }
}

async function testGateway(): Promise<{
  ok: boolean;
  modelUsed?: string;
  error?: string;
  responseTime: number;
}> {
  const start = Date.now();
  try {
    const result = await callAI({
      systemPrompt: "Reply with exactly: OK",
      userPrompt: "ping",
      temperature: 0,
      maxTokens: 10,
    });
    return { ok: true, modelUsed: result.modelName, responseTime: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
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

  // Test each model directly via raw fetch
  const directTests = await Promise.all(models.map(testRawFetch));

  // Test through the actual gateway (callAI)
  const gatewayTest = await testGateway();

  return NextResponse.json({
    status: gatewayTest.ok ? "ok" : "error",
    nodeVersion: process.version,
    gateway: gatewayTest,
    directTests: models.map((m, i) => ({ id: m.id, ...directTests[i] })),
    rateLimits: rateLimits || [],
    resetDone: reset,
  });
}
