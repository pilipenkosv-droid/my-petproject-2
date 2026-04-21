// Extractor smoke test against one of the golden docs.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { extractDocument } from "../../../src/lib/pipeline-v6/extractor/mammoth-extractor";

const MANIFEST_PATH = path.join(process.cwd(), "data/golden/manifest.json");
const hasManifest = fs.existsSync(MANIFEST_PATH);

function pickRawPath(): string | null {
  if (!hasManifest) return null;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const ok = manifest.documents.find((d: { download_status: string; raw_path: string }) =>
    d.download_status === "ok" && fs.existsSync(d.raw_path),
  );
  return ok ? ok.raw_path : null;
}

describe.skipIf(!hasManifest)("extractDocument", () => {
  it("extracts markdown + assets from a real golden doc", async () => {
    const rawPath = pickRawPath();
    if (!rawPath) {
      console.warn("No raw .docx available, skipping");
      return;
    }
    const buf = fs.readFileSync(rawPath);
    const result = await extractDocument(buf);

    expect(result.markdown.length).toBeGreaterThan(100);
    expect(result.statistics.paragraphs).toBeGreaterThan(0);
    expect(result.statistics.words).toBeGreaterThan(100);
    expect(Array.isArray(result.assets.images)).toBe(true);
    expect(Array.isArray(result.assets.tables)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
