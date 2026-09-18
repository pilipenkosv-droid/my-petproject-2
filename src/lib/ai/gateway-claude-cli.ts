/**
 * Вызов Claude через локальный `claude` CLI. Вынесено из gateway-providers.ts
 * ради обозримости файла транспорта.
 */

import { ModelConfig } from "./model-registry";
import type { GatewayRequest, ProviderResult } from "./gateway-types";

/**
 * Вызов Claude через локальный `claude` CLI (shell out).
 * Политика проекта: Claude-модели НЕ через Anthropic API, только CLI/Agent.
 */
export async function callClaudeCli(
  config: ModelConfig,
  request: GatewayRequest
): Promise<ProviderResult> {
  const { spawn } = await import("child_process");
  const prompt = `${request.systemPrompt}\n\n${request.userPrompt}`;
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SSE_PORT;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  return new Promise<ProviderResult>((resolve, reject) => {
    const proc = spawn(
      "claude",
      ["-p", prompt, "--model", config.modelId, "--output-format", "text"],
      { env }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${config.displayName} exit ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      let text = stdout.trim();
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fence) text = fence[1].trim();
      resolve({ text });
    });
  });
}
