/**
 * Diagnostic endpoint to verify AI model availability.
 * DELETE THIS FILE after verification.
 */
import { NextResponse } from "next/server";
import { getAvailableModels } from "@/lib/ai/model-registry";
import { callAI } from "@/lib/ai/gateway";

export const maxDuration = 30;

export async function GET() {
  const models = getAvailableModels();

  const results: Array<{
    id: string;
    displayName: string;
    available: boolean;
    responseTime?: number;
    error?: string;
  }> = [];

  for (const model of models) {
    const start = Date.now();
    try {
      const resp = await callAI({
        systemPrompt: "Reply with exactly: OK",
        userPrompt: "ping",
        temperature: 0,
        maxTokens: 10,
      });
      results.push({
        id: model.id,
        displayName: model.displayName,
        available: true,
        responseTime: Date.now() - start,
      });
      // Only need to verify first working model
      break;
    } catch (error) {
      results.push({
        id: model.id,
        displayName: model.displayName,
        available: false,
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const anyAvailable = results.some((r) => r.available);

  return NextResponse.json({
    status: anyAvailable ? "ok" : "error",
    modelsConfigured: models.length,
    results,
    envKeys: {
      AI_GATEWAY_API_KEY: !!process.env.AI_GATEWAY_API_KEY,
      AITUNNEL_API_KEY: !!process.env.AITUNNEL_API_KEY,
    },
  });
}
