/** Which T0 verdicts are worth an LLM call. */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import { candidatesForLlm } from "@/lib/pipeline-v7/classify/llm-candidates";
import type { ClassificationResult } from "@/lib/pipeline-v7/classify/types";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { miniPackage, p, type MiniDocxParts } from "./helpers/mini-docx";

/** Plain sentences, so the suspect guard never fires on a two-paragraph test. */
const filler = (n = 12) =>
  Array.from({ length: n }, (_, i) => p(`Обычное предложение номер ${i + 1} в основном тексте.`)).join("");

/** Everything sits after a lead heading, out of reach of the title-page pass. */
const LEAD = p("ВВЕДЕНИЕ");

async function classify(parts: MiniDocxParts): Promise<ClassificationResult> {
  return classifyDocument(await miniPackage(parts));
}

describe("candidatesForLlm", () => {
  it("keeps formatted unknowns and drops plain sentences", async () => {
    const centred = p("Методика оценки", '<w:jc w:val="center"/>', "<w:rPr><w:b/></w:rPr>");
    const r = await classify({ body: LEAD + centred + filler() });
    const texts = candidatesForLlm(r).map((c) => c.text);
    expect(texts).toContain("Методика оценки");
    expect(texts.some((t) => t?.startsWith("Обычное предложение"))).toBe(false);
  });

  it("returns nothing when every paragraph is decided with high confidence", async () => {
    const r = await classify({ body: p("Ячейка") });
    expect(candidatesForLlm(r).every((c) => c.confidence < 0.85 || c.role === "unknown")).toBe(true);
  });
});

const REAL_DIR = "/Users/sergejpilipenko/diplox/data/corpus/real";
const SYNTH_DIR = path.resolve(__dirname, "../../../data/corpus/synthetic");

function listDocx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".docx") && !f.startsWith("~$"))
    .map((f) => path.join(dir, f));
}

for (const [label, dir] of [["real", REAL_DIR], ["synthetic", SYNTH_DIR]] as const) {
  const files = listDocx(dir);
  describe.skipIf(files.length === 0)(`classify smoke — ${label} corpus`, () => {
    // 20 s, not the default 5: this walks the whole real corpus, and under a
    // parallel run it lands just over the default and goes red for no reason.
    it("classifies every document quickly and non-trivially", { timeout: 20_000 }, async () => {
      let suspects = 0;
      for (const file of files) {
        const pkg = await DocxPackage.load(fs.readFileSync(file));
        const started = Date.now();
        const r = await classifyDocument(pkg);
        const elapsed = Date.now() - started;
        expect(elapsed, `${path.basename(file)} took ${elapsed}ms`).toBeLessThan(2000);
        expect(r.list.length, path.basename(file)).toBeGreaterThan(0);
        if (r.suspect) suspects += 1;
      }
      console.log(`[classify smoke] ${label}: ${suspects}/${files.length} suspect`);
    });
  });
}
