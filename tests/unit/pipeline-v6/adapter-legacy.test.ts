// A3 regression: statistics.tableCount must reflect the ORIGINAL document,
// not extracted.assets.tables (always empty — mammoth's input has every
// <w:tbl> stripped before extraction, see orchestrator.ts stripTablesForMammoth).

import { describe, it, expect } from "vitest";
import { adaptPipelineV6ToLegacy } from "../../../src/lib/pipeline-v6/adapter-legacy";
import type { PipelineResult } from "../../../src/lib/pipeline-v6/orchestrator";
import type { QualityReport } from "../../../src/lib/pipeline-v6/checker";

function makeQualityReport(): QualityReport {
  return {
    documentId: "doc-1",
    timestamp: new Date().toISOString(),
    score: 100,
    categories: {},
    checks: [],
    stats: { paragraphCount: 10, tableCount: 0, imageCount: 0, bodyTextCount: 10, headingCount: 3 },
  };
}

function makePipelineResult(originalTableCount: number): PipelineResult {
  return {
    output: Buffer.from("output"),
    extracted: {
      markdown: "some text ".repeat(50),
      // Always empty by construction — mammoth never sees the tables.
      assets: { images: [], tables: [] },
      warnings: [],
      statistics: { h1Count: 1, h2Count: 0, h3Count: 0, paragraphs: 10, words: 50, formulas: 0 },
    },
    structure: { route: "preserve" } as PipelineResult["structure"],
    rewrittenSlots: 0,
    tableAssemblyPlan: { pandoc: 0, docxtpl: 0 },
    originalTableCount,
    initialReport: makeQualityReport(),
    finalReport: makeQualityReport(),
    fixPlan: { targetScore: 100 } as PipelineResult["fixPlan"],
    suggestions: [],
    timings: { extractMs: 1, analyzeMs: 1, rewriteMs: 0, assembleMs: 1, checkMs: 1, fixMs: 0, totalMs: 5 },
  };
}

describe("adaptPipelineV6ToLegacy — statistics.tableCount", () => {
  it("uses originalTableCount, not extracted.assets.tables.length", async () => {
    const result = makePipelineResult(7);
    const adapted = await adaptPipelineV6ToLegacy(Buffer.from("source"), result, "none");
    expect(adapted.statistics.tableCount).toBe(7);
  });

  it("stays 0 when the source document truly has no tables", async () => {
    const result = makePipelineResult(0);
    const adapted = await adaptPipelineV6ToLegacy(Buffer.from("source"), result, "none");
    expect(adapted.statistics.tableCount).toBe(0);
  });

  it("leaves imageCount unaffected (images are not stripped for mammoth)", async () => {
    const result = makePipelineResult(3);
    result.extracted.assets.images = [{ filename: "a.png", mimeType: "image/png", base64: "" }];
    const adapted = await adaptPipelineV6ToLegacy(Buffer.from("source"), result, "none");
    expect(adapted.statistics.imageCount).toBe(1);
  });
});
