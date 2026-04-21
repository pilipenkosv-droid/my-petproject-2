// ADR-013 phase 1 acceptance: передача rulePack с изменённым fontSize
// ломает именно соответствующий check и ничего больше.

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { runPipelineV6 } from "../../../src/lib/pipeline-v6/orchestrator";
import { GOST_7_32, resolveRulePack, DEFAULT_RULE_PACK_SLUG } from "../../../src/lib/pipeline-v6/rule-packs";

const hasPandoc = (() => {
  try {
    execSync("pandoc --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const MANIFEST_PATH = path.join(process.cwd(), "data/golden/manifest.json");
const REFERENCE = path.join(process.cwd(), "scripts/pipeline-v6/spike-pandoc/reference-gost.docx");
const hasManifest = fs.existsSync(MANIFEST_PATH) && fs.existsSync(REFERENCE);

function pickRawPath(): string | null {
  if (!hasManifest) return null;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const any = manifest.documents.find(
    (d: { download_status: string; raw_path: string }) =>
      d.download_status === "ok" && fs.existsSync(d.raw_path),
  );
  return any ? any.raw_path : null;
}

describe("rule-packs registry", () => {
  it("resolves default slug to GOST_7_32", () => {
    expect(resolveRulePack(DEFAULT_RULE_PACK_SLUG)).toBe(GOST_7_32);
    expect(resolveRulePack().slug).toBe("gost-7.32");
  });

  it("throws on unknown slug", () => {
    expect(() => resolveRulePack("does-not-exist")).toThrow(/Unknown rule pack/);
  });
});

describe.skipIf(!hasPandoc || !hasManifest)("rule pack — mismatch isolation", () => {
  it("breaks page.margins.top when rulePack.margins.top changes, leaving others untouched", async () => {
    const rawPath = pickRawPath()!;
    const buffer = fs.readFileSync(rawPath);
    const base = {
      documentId: "test-margin-top",
      referenceDoc: REFERENCE,
      rewrite: false,
      fixIterations: 0,
    } as const;

    const ok = await runPipelineV6(buffer, { ...base, templateSlug: DEFAULT_RULE_PACK_SLUG });
    const mismatched = await runPipelineV6(buffer, {
      ...base,
      rulePack: {
        ...GOST_7_32,
        values: { ...GOST_7_32.values, margins: { ...GOST_7_32.values.margins, top: 40 } },
      },
    });

    const okMargin = ok.finalReport.checks.find((c) => c.id === "page.margins.top");
    const mmMargin = mismatched.finalReport.checks.find((c) => c.id === "page.margins.top");
    expect(okMargin?.passed).toBe(true);
    expect(mmMargin?.passed).toBe(false);

    const regressed = ok.finalReport.checks
      .filter((c) => c.passed && c.id !== "page.margins.top")
      .filter((c) => !mismatched.finalReport.checks.find((m) => m.id === c.id && m.passed));
    expect(regressed).toEqual([]);
  }, 60_000);
});
