import { describe, it, expect } from "vitest";
import { detectTableComplexity } from "../../../src/lib/pipeline-v6/assembler/docxtpl";

describe("detectTableComplexity", () => {
  it("classifies simple 3x3 table as pandoc", () => {
    const result = detectTableComplexity({
      rows: [["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]],
      hasMergedCells: false,
      columnCount: 3,
    });
    expect(result.complexity).toBe("simple");
    expect(result.recommendedAssembler).toBe("pandoc");
  });

  it("routes merged-cell tables to docxtpl", () => {
    const result = detectTableComplexity({
      rows: [["header", ""], ["a", "b"]],
      hasMergedCells: true,
      columnCount: 2,
    });
    expect(result.complexity).toBe("complex");
    expect(result.recommendedAssembler).toBe("docxtpl");
  });

  it("routes multi-header tables to docxtpl", () => {
    const result = detectTableComplexity({
      rows: [["h1", "h2"], ["sub1", "sub2", "sub3"]],
      hasMergedCells: false,
      columnCount: 3,
    });
    expect(result.hasMultiHeader).toBe(true);
    expect(result.recommendedAssembler).toBe("docxtpl");
  });

  it("marks wide tables as moderate but still pandoc", () => {
    const result = detectTableComplexity({
      rows: [Array(7).fill("x"), Array(7).fill("y")],
      hasMergedCells: false,
      columnCount: 7,
    });
    expect(result.complexity).toBe("moderate");
    expect(result.recommendedAssembler).toBe("pandoc");
  });
});
