import { describe, it, expect } from "vitest";
import { importCsv, parseCsv } from "../../../scripts/pipeline-v7/labels-import";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HEADER = "i,text,styleId,boldAll,capsRatio,jc,sz,numPr,keepNext,inTable,t0_role,confidence,source,gold";

function withTmpCsv(rows: string, run: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "labels-import-test-"));
  const path = join(dir, "doc-a.csv");
  writeFileSync(path, rows);
  try {
    run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("parseCsv", () => {
  it("splits plain rows on commas", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const rows = parseCsv('i,text\n0,"hello, ""world"""\n');
    expect(rows).toEqual([
      ["i", "text"],
      ["0", 'hello, "world"'],
    ]);
  });
});

describe("importCsv", () => {
  it("uses the gold column when present", () => {
    const rows = `${HEADER}\n0,txt,,false,0.00,,28,,false,false,body,0.80,style,heading_L1\n`;
    withTmpCsv(rows, (path) => {
      const result = importCsv(path);
      expect(result.errors).toEqual([]);
      expect(result.labels).toEqual([{ i: 0, role: "heading_L1" }]);
      expect(result.emptyGoldDefaulted).toBe(0);
    });
  });

  it("falls back to t0_role when gold is empty", () => {
    const rows = `${HEADER}\n0,txt,,false,0.00,,28,,false,false,body,0.80,style,\n`;
    withTmpCsv(rows, (path) => {
      const result = importCsv(path);
      expect(result.errors).toEqual([]);
      expect(result.labels).toEqual([{ i: 0, role: "body" }]);
      expect(result.emptyGoldDefaulted).toBe(1);
    });
  });

  it("rejects a role that is not in the Role enum", () => {
    const rows = `${HEADER}\n0,txt,,false,0.00,,28,,false,false,body,0.80,style,not_a_role\n`;
    withTmpCsv(rows, (path) => {
      const result = importCsv(path);
      expect(result.labels).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not_a_role");
    });
  });

  it("rejects a non-integer index", () => {
    const rows = `${HEADER}\nX,txt,,false,0.00,,28,,false,false,body,0.80,style,body\n`;
    withTmpCsv(rows, (path) => {
      const result = importCsv(path);
      expect(result.labels).toEqual([]);
      expect(result.errors).toHaveLength(1);
    });
  });

  it("derives documentId from the file name", () => {
    const rows = `${HEADER}\n0,txt,,false,0.00,,28,,false,false,body,0.80,style,body\n`;
    withTmpCsv(rows, (path) => {
      const result = importCsv(path);
      expect(result.documentId).toBe("doc-a");
    });
  });
});
