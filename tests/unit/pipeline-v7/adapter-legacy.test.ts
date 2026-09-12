/**
 * The route consumes one shape regardless of pipeline. These tests pin that:
 * the v7 adapter's keys must match the v6 adapter's, plus the experiment's own
 * telemetry, and the trial path must cut both buffers exactly as v6 does.
 */

import { describe, it, expect, vi } from "vitest";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { runPipelineV7 } from "@/lib/pipeline-v7/orchestrator";
import { adaptPipelineV7ToLegacy } from "@/lib/pipeline-v7/adapter-legacy";
import { adaptPipelineV6ToLegacy } from "@/lib/pipeline-v6/adapter-legacy";
import type { PipelineResult } from "@/lib/pipeline-v6/orchestrator";
import type { QualityReport } from "@/lib/pipeline-v6/checker";
import { buildMiniDocx, p } from "./helpers/mini-docx";

vi.mock("@/lib/pipeline/document-analyzer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pipeline/document-analyzer")>();
  return {
    ...actual,
    truncateDocxToPageLimit: vi.fn(async (buffer: Buffer) => ({
      buffer: Buffer.concat([buffer.subarray(0, 1), buffer.subarray(0, 1)]),
      wasTruncated: true,
      originalPageCount: 12,
      pageLimitApplied: 3,
    })),
  };
});

const BODY =
  p("ВВЕДЕНИЕ", `<w:outlineLvl w:val="0"/>`) +
  p("Первый абзац основного текста работы.") +
  p("Второй абзац основного текста работы.") +
  `<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr></w:p>`;

const doc = () => buildMiniDocx({ body: BODY, styles: "" });

async function runAndAdapt(accessType: "trial" | "none") {
  const source = await doc();
  const result = await runPipelineV7(source, { pack: GOST_7_32, documentId: "mini" });
  return adaptPipelineV7ToLegacy(source, result, accessType);
}

/** A v6 result stub — enough for the adapter, no pandoc involved. */
function v6Result(): PipelineResult {
  const report: QualityReport = {
    documentId: "mini",
    timestamp: new Date().toISOString(),
    score: 100,
    categories: {},
    checks: [],
    stats: { paragraphCount: 3, tableCount: 0, imageCount: 0, bodyTextCount: 2, headingCount: 1 },
  };
  return {
    output: Buffer.from("output"),
    extracted: {
      markdown: "текст ".repeat(50),
      assets: { images: [], tables: [] },
      warnings: [],
      statistics: { h1Count: 1, h2Count: 0, h3Count: 0, paragraphs: 3, words: 50, formulas: 0 },
    },
    structure: { route: "preserve" } as PipelineResult["structure"],
    rewrittenSlots: 0,
    tableAssemblyPlan: { pandoc: 0, docxtpl: 0 },
    originalTableCount: 0,
    initialReport: report,
    finalReport: report,
    fixPlan: { targetScore: 100 } as PipelineResult["fixPlan"],
    suggestions: [],
    timings: { extractMs: 1, analyzeMs: 1, rewriteMs: 0, assembleMs: 1, checkMs: 1, fixMs: 0, totalMs: 5 },
  };
}

describe("adaptPipelineV7ToLegacy", () => {
  it("отдаёт те же поля верхнего уровня, что и адаптер v6", async () => {
    const v7 = await runAndAdapt("none");
    const v6 = await adaptPipelineV6ToLegacy(Buffer.from("source"), v6Result(), "none");
    expect(Object.keys(v7).sort()).toEqual(Object.keys(v6).sort());
  });

  it("statistics повторяет ключи v6 и добавляет только телеметрию эксперимента", async () => {
    const v7 = await runAndAdapt("none");
    const v6 = await adaptPipelineV6ToLegacy(Buffer.from("source"), v6Result(), "none");
    const extra = Object.keys(v7.statistics).filter((k) => !(k in v6.statistics));
    expect(extra.sort()).toEqual(["pipelineVersion", "v7"]);
    for (const k of Object.keys(v6.statistics)) expect(v7.statistics).toHaveProperty(k);
  });

  it("markedOriginal — исходный буфер, formattedDocument — выход пайплайна", async () => {
    const source = await doc();
    const result = await runPipelineV7(source, { pack: GOST_7_32, documentId: "mini" });
    const adapted = await adaptPipelineV7ToLegacy(source, result, "none");
    expect(adapted.markedOriginal.equals(source)).toBe(true);
    expect(adapted.formattedDocument.equals(result.output!)).toBe(true);
    expect(adapted.wasTruncated).toBe(false);
  });

  it("считает текст, абзацы и время из отчёта", async () => {
    const adapted = await runAndAdapt("none");
    expect(adapted.statistics.totalCharacters).toBeGreaterThan(0);
    expect(adapted.statistics.wordCount).toBeGreaterThan(0);
    expect(adapted.statistics.charactersWithoutSpaces).toBeLessThan(adapted.statistics.totalCharacters);
    expect(adapted.statistics.paragraphCount).toBeGreaterThan(0);
    expect(adapted.statistics.pageCount).toBeGreaterThanOrEqual(1);
    expect(adapted.statistics.pipelineTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("телеметрия v7 попадает в statistics", async () => {
    const adapted = await runAndAdapt("none");
    expect(adapted.statistics.pipelineVersion).toBe("v7");
    expect(adapted.statistics.v7?.gatePass).toBe(true);
    expect(adapted.statistics.v7?.classification.suspect).toBe(false);
    expect(adapted.statistics.v7?.classification.histogram.heading_L1).toBeGreaterThan(0);
    expect(typeof adapted.statistics.v7?.finalScoreUndef).toBe("number");
    expect(typeof adapted.statistics.v7?.finalScoreRoles).toBe("number");
    expect(adapted.statistics.v7?.refused).toBeUndefined();
  });

  it("на trial режет оба буфера и сохраняет полные версии", async () => {
    const adapted = await runAndAdapt("trial");
    expect(adapted.wasTruncated).toBe(true);
    expect(adapted.originalPageCount).toBe(12);
    expect(adapted.pageLimitApplied).toBe(3);
    expect(adapted.statistics.pageCount).toBe(3);
    expect(adapted.statistics.wasTruncated).toBe(true);
    expect(adapted.fullMarkedOriginal?.length).toBeGreaterThan(adapted.markedOriginal.length);
    expect(adapted.fullFormattedDocument?.length).toBeGreaterThan(adapted.formattedDocument.length);
  });

  it("нарушения исходника размечены как autoFixable, если v7 их закрыл", async () => {
    const adapted = await runAndAdapt("none");
    expect(adapted.violations.length).toBeGreaterThan(0);
    expect(adapted.fixesApplied).toBe(adapted.violations.filter((v) => v.autoFixable).length);
    for (const v of adapted.violations) {
      expect(v.ruleId).toBeTruthy();
      expect(v.message).toContain("ожидается");
    }
  });

  it("падает, если гейт не отдал буфер", async () => {
    const source = await doc();
    const result = await runPipelineV7(source, { pack: GOST_7_32, documentId: "mini" });
    await expect(
      adaptPipelineV7ToLegacy(source, { report: result.report }, "none")
    ).rejects.toThrow(/гейт/);
  });
});
