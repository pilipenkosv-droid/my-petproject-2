import { describe, it, expect } from "vitest";
import {
  planFixes,
  applyAutoFixesToXml,
  summariseSuggestions,
} from "../../../src/lib/pipeline-v6/fix-suggest/fix-loop";
import type { QualityReport, CheckResult } from "../../../src/lib/pipeline-v6/checker";

function makeCheck(id: string, passed: boolean, severity: "critical" | "major" | "minor" = "major"): CheckResult {
  return {
    id,
    category: "text",
    name: id,
    passed,
    severity,
    expected: "ok",
    actual: passed ? "ok" : "bad",
  };
}

function makeReport(checks: CheckResult[]): QualityReport {
  return {
    documentId: "test",
    timestamp: "2026-04-21",
    score: 70,
    categories: {},
    checks,
    stats: {} as unknown as QualityReport["stats"],
  };
}

describe("planFixes", () => {
  it("classifies multipleSpaces/noUnderline/noColoredText as auto", () => {
    const report = makeReport([
      makeCheck("text.multipleSpaces", false),
      makeCheck("text.noUnderline", false),
      makeCheck("text.noColoredText", false),
      makeCheck("structure.tocFieldCode", false, "critical"),
      makeCheck("page.margins.top", true),
    ]);
    const plan = planFixes(report);
    const auto = plan.actions.filter((a) => a.strategy === "auto").map((a) => a.checkId);
    expect(auto).toEqual([
      "text.multipleSpaces",
      "text.noUnderline",
      "text.noColoredText",
    ]);
    expect(plan.actions.find((a) => a.checkId === "structure.tocFieldCode")?.strategy).toBe("llm-suggest");
    expect(plan.actions.find((a) => a.checkId === "page.margins.top")).toBeUndefined();
  });
});

describe("applyAutoFixesToXml", () => {
  it("collapses multiple spaces inside <w:t>", () => {
    const xml = '<w:t>hello    world</w:t>';
    const { xml: out, applied } = applyAutoFixesToXml(xml, [makeCheck("text.multipleSpaces", false)]);
    expect(out).toBe("<w:t>hello world</w:t>");
    expect(applied).toContain("text.multipleSpaces");
  });

  it("strips <w:u/> underline tags", () => {
    const xml = '<w:rPr><w:u w:val="single"/></w:rPr>';
    const { xml: out } = applyAutoFixesToXml(xml, [makeCheck("text.noUnderline", false)]);
    expect(out).toBe("<w:rPr></w:rPr>");
  });

  it("strips color, highlight, shading", () => {
    const xml = '<w:rPr><w:color w:val="FF0000"/><w:highlight w:val="yellow"/><w:shd w:val="clear"/></w:rPr>';
    const { xml: out } = applyAutoFixesToXml(xml, [makeCheck("text.noColoredText", false)]);
    expect(out).toBe("<w:rPr></w:rPr>");
  });
});

describe("summariseSuggestions", () => {
  it("returns only non-auto failed checks", () => {
    const report = makeReport([
      makeCheck("text.multipleSpaces", false),
      makeCheck("structure.titlePage", false, "critical"),
      makeCheck("page.margins.top", true),
    ]);
    const sugg = summariseSuggestions(report);
    expect(sugg).toHaveLength(1);
    expect(sugg[0].checkId).toBe("structure.titlePage");
  });
});
