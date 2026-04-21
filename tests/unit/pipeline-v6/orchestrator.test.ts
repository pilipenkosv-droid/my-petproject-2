// End-to-end orchestrator smoke test on one golden doc.
// Runs extract→analyze→assemble→check. Skips rewrite (LLM) and relies on
// local pandoc CLI being available.

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { runPipelineV6 } from "../../../src/lib/pipeline-v6/orchestrator";

const hasPandoc = (() => {
  try {
    execSync("pandoc --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const MANIFEST_PATH = path.join(process.cwd(), "data/golden/manifest.json");
const REFERENCE = path.join(
  process.cwd(),
  "scripts/pipeline-v6/spike-pandoc/reference-gost.docx",
);
const hasManifest = fs.existsSync(MANIFEST_PATH) && fs.existsSync(REFERENCE);

function pickRawPath(): string | null {
  if (!hasManifest) return null;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const ok = manifest.documents.find(
    (d: { download_status: string; raw_path: string; complexity: { structure_confidence: number } | null }) =>
      d.download_status === "ok" &&
      fs.existsSync(d.raw_path) &&
      (d.complexity?.structure_confidence ?? 0) >= 1.0,
  );
  if (ok) return ok.raw_path;
  const any = manifest.documents.find(
    (d: { download_status: string; raw_path: string }) =>
      d.download_status === "ok" && fs.existsSync(d.raw_path),
  );
  return any ? any.raw_path : null;
}

describe.skipIf(!hasPandoc || !hasManifest)("runPipelineV6", () => {
  it("completes extract→analyze→assemble→check on a real golden doc", async () => {
    const rawPath = pickRawPath();
    if (!rawPath) return;
    const buffer = fs.readFileSync(rawPath);

    const result = await runPipelineV6(buffer, {
      documentId: path.basename(rawPath, ".docx"),
      referenceDoc: REFERENCE,
      rewrite: false,
      metadata: { title: "Интеграционный прогон v6", lang: "ru" },
      fixIterations: 1,
    });

    expect(result.output.length).toBeGreaterThan(5000);
    expect(result.extracted.markdown.length).toBeGreaterThan(100);
    expect(["preserve", "heuristic", "llm-full"]).toContain(result.structure.route);
    expect(result.initialReport.score).toBeGreaterThanOrEqual(0);
    expect(result.finalReport.score).toBeGreaterThanOrEqual(result.initialReport.score);
    expect(result.timings.totalMs).toBeGreaterThan(0);
    expect(result.timings.extractMs + result.timings.assembleMs + result.timings.checkMs)
      .toBeLessThanOrEqual(result.timings.totalMs);
  }, 60_000);
});
