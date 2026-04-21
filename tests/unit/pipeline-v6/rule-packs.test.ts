// ADR-013 phase 1 acceptance: передача rulePack с изменённым fontSize
// ломает именно соответствующий check и ничего больше.

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { runPipelineV6 } from "../../../src/lib/pipeline-v6/orchestrator";
import { GOST_7_32, DEMO_ALT, resolveRulePack, DEFAULT_RULE_PACK_SLUG } from "../../../src/lib/pipeline-v6/rule-packs";

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

  it("resolves demo-alt with non-GOST values", () => {
    const pack = resolveRulePack("demo-alt");
    expect(pack).toBe(DEMO_ALT);
    expect(pack.values.fontFamily).toBe("Arial");
    expect(pack.values.tocTitle).toBe("ОГЛАВЛЕНИЕ");
    expect(pack.values.margins).toEqual({ top: 25, bottom: 25, left: 25, right: 15 });
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

  it("runs pipeline end-to-end with demo-alt pack (non-GOST params)", async () => {
    const rawPath = pickRawPath()!;
    const buffer = fs.readFileSync(rawPath);
    const demoRef = path.join(process.cwd(), "templates/reference-demo-alt.docx");
    if (!fs.existsSync(demoRef)) {
      throw new Error(
        "templates/reference-demo-alt.docx missing — run `npx tsx scripts/pipeline-v6/tune-reference-doc.ts demo-alt`",
      );
    }

    const result = await runPipelineV6(buffer, {
      documentId: "test-demo-alt",
      templateSlug: "demo-alt",
      rewrite: false,
      fixIterations: 0,
    });

    // Checker должен проверять поля по demo-alt (25/25/25/15), а не по ГОСТ (20/10/20/30).
    const marginTop = result.finalReport.checks.find((c) => c.id === "page.margins.top");
    const marginRight = result.finalReport.checks.find((c) => c.id === "page.margins.right");
    expect(marginTop?.passed).toBe(true);
    expect(marginRight?.passed).toBe(true);

    // TOC-заголовок должен быть "ОГЛАВЛЕНИЕ" (а не "СОДЕРЖАНИЕ").
    const tocHeading = result.finalReport.checks.find((c) => c.id === "structure.tocHeading");
    expect(tocHeading?.passed).toBe(true);
  }, 60_000);
});
