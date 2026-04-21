import { describe, it, expect } from "vitest";
import { analyzeStructure } from "../../../src/lib/pipeline-v6/analyzer/structure-analyzer";
import type { ExtractedDocument } from "../../../src/lib/pipeline-v6/extractor/mammoth-extractor";

function makeDoc(markdown: string, overrides: Partial<ExtractedDocument["statistics"]> = {}): ExtractedDocument {
  const lines = markdown.split("\n");
  return {
    markdown,
    assets: { images: [], tables: [] },
    warnings: [],
    statistics: {
      h1Count: lines.filter((l) => /^#\s/.test(l)).length,
      h2Count: lines.filter((l) => /^##\s/.test(l)).length,
      h3Count: lines.filter((l) => /^###\s/.test(l)).length,
      paragraphs: lines.filter((l) => l.trim()).length,
      words: markdown.split(/\s+/).length,
      formulas: 0,
      ...overrides,
    },
  };
}

describe("analyzeStructure", () => {
  it("routes well-structured doc to preserve", () => {
    const doc = makeDoc(
      "# Введение\n\ntext\n\n# Глава 1\n\n## Раздел 1.1\n\ntext\n\n# Заключение\n\ntext\n\n# Список литературы\n",
    );
    const report = analyzeStructure(doc);
    expect(report.route).toBe("preserve");
    expect(report.confidence).toBeGreaterThanOrEqual(0.9);
    expect(report.sections.some((s) => s.type === "introduction")).toBe(true);
    expect(report.sections.some((s) => s.type === "bibliography")).toBe(true);
  });

  it("routes partial structure to heuristic", () => {
    const doc = makeDoc("# Введение\n\ntext\n\n# Заключение\n\ntext\n");
    const report = analyzeStructure(doc);
    expect(report.route).toBe("heuristic");
  });

  it("routes plain text to llm-full", () => {
    const doc = makeDoc("plain paragraph.\n\nanother paragraph.\n");
    const report = analyzeStructure(doc);
    expect(report.route).toBe("llm-full");
    expect(report.needsLLM).toBe(true);
  });

  it("detects structural markers in plain-text body", () => {
    const doc = makeDoc("some intro.\n\nВведение\n\nbody here.\n\nЗаключение\n\nend.\n");
    const report = analyzeStructure(doc);
    expect(report.sections.some((s) => s.type === "introduction")).toBe(true);
    expect(report.sections.some((s) => s.type === "conclusion")).toBe(true);
  });
});
