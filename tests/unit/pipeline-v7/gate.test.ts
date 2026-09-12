import { describe, it, expect } from "vitest";
import { computeFingerprint } from "@/lib/pipeline-v7/fingerprint/compute";
import {
  assertGate,
  evaluateGate,
  FidelityGateError,
  type GateOptions,
  type GateResult,
} from "@/lib/pipeline-v7/fingerprint/gate";
import { buildDocx, p, field, sectPr, type MiniDocxSpec } from "./helpers/fp-docx";

type Spec = MiniDocxSpec | string;

const spec = (s: Spec): MiniDocxSpec => (typeof s === "string" ? { body: s } : s);

async function gate(before: Spec, after: Spec, opts: GateOptions = {}): Promise<GateResult> {
  const a = await computeFingerprint(await buildDocx(spec(before)));
  const b = await computeFingerprint(await buildDocx(spec(after)));
  return evaluateGate(a, b, opts);
}

const kinds = (r: GateResult) => r.violations.map((v) => v.kind).sort();
const rules = (r: GateResult) => [...new Set(r.allowed.map((a) => a.rule))].sort();

const TABLE = (gridSpan = true) =>
  `<w:tbl><w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="100"/></w:tblGrid>` +
  `<w:tr><w:tc>${gridSpan ? '<w:tcPr><w:gridSpan w:val="2"/></w:tcPr>' : ""}${p("шапка")}</w:tc></w:tr>` +
  `<w:tr><w:tc>${p("левая")}</w:tc><w:tc>${p("правая")}</w:tc></w:tr></w:tbl>`;

const ANCHOR = `<w:p><w:bookmarkStart w:id="1" w:name="_Toc1"/><w:r><w:t>Введение</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>`;
const REF_P = (name: string) => `<w:p><w:r><w:t>см. </w:t></w:r>${field(`REF ${name} \\h`, "1")}</w:p>`;

const BASE = [p("Титул"), ANCHOR, p("Текст"), TABLE(), sectPr()].join("");

describe("gate — identity", () => {
  it("passes for an unchanged document", async () => {
    const result = await gate(BASE, BASE);
    expect(result.violations).toEqual([]);
    expect(result.pass).toBe(true);
  });
});

describe("gate — allowances", () => {
  it("A1: accepts an insertion inside a _dpx_aux_toc range", async () => {
    const marked =
      `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:bookmarkStart w:id="9" w:name="_dpx_aux_toc_1"/>` +
      `<w:r><w:t>Введение</w:t></w:r>${field("PAGEREF _Toc1 \\h", "3")}<w:bookmarkEnd w:id="9"/></w:p>`;
    const after = [p("Титул"), marked, ANCHOR, p("Текст"), TABLE(), sectPr()].join("");
    const result = await gate(BASE, after);
    expect(result.violations.map((v) => v.message)).toEqual([]);
    expect(rules(result)).toContain("A1");
  });

  it("A1: rejects an insertion whose aux range is missing", async () => {
    const after = [p("Титул"), p("Введение"), ANCHOR, p("Текст"), TABLE(), sectPr()].join("");
    expect(kinds(await gate(BASE, after))).toEqual(["block-inserted"]);
  });

  it("A2: accepts removal of an old table of contents", async () => {
    const toc =
      `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t>Введение</w:t></w:r>` +
      `${field("PAGEREF _Toc1 \\h", "3")}</w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="TOC2"/></w:pPr><w:r><w:t>Глава 1</w:t></w:r></w:p>`;
    const before = [p("СОДЕРЖАНИЕ"), toc, ANCHOR, p("Текст"), sectPr()].join("");
    const after = [p("СОДЕРЖАНИЕ"), ANCHOR, p("Текст"), sectPr()].join("");
    const result = await gate(before, after);
    expect(result.violations.map((v) => v.message)).toEqual([]);
    expect(rules(result)).toContain("A2");
  });

  it("A2: rejects a TOC-shaped removal with no heading next to it", async () => {
    const toc = `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t>Введение</w:t></w:r></w:p>`;
    const before = [p("Титул"), toc, p("Текст"), sectPr()].join("");
    const after = [p("Титул"), p("Текст"), sectPr()].join("");
    expect(kinds(await gate(before, after))).toEqual(["block-removed"]);
  });

  it("A3: accepts empty-paragraph removal up to the cap", async () => {
    const filler = Array.from({ length: 20 }, (_, i) => p(`строка ${i}`)).join("");
    const before = [p("Титул"), "<w:p/>", "<w:p/>", filler, sectPr()].join("");
    const after = [p("Титул"), "<w:p/>", filler, sectPr()].join("");
    const result = await gate(before, after);
    expect(result.violations.map((v) => v.message)).toEqual([]);
    expect(rules(result)).toEqual(["A3"]);
  });

  it("A3: rejects empty-paragraph removal over the cap", async () => {
    const filler = Array.from({ length: 20 }, (_, i) => p(`строка ${i}`)).join("");
    const before = [p("Титул"), "<w:p/>", "<w:p/>", filler, sectPr()].join("");
    const after = [p("Титул"), filler, sectPr()].join("");
    expect(kinds(await gate(before, after))).toEqual(["empty-removal-cap"]);
  });

  it("A4: accepts pure normalisation only when the option is on", async () => {
    const before = [p("«Тема» 10–12"), sectPr()].join("");
    const after = [p('"Тема" 10-12'), sectPr()].join("");
    expect(kinds(await gate(before, after))).toEqual(["text-changed"]);
    const relaxed = await gate(before, after, { allowTextNormalization: true });
    expect(relaxed.pass).toBe(true);
    expect(rules(relaxed)).toEqual(["A4"]);
  });

  it("A4: never accepts a real text change", async () => {
    const before = [p("Иванов Иван Иванович 2026"), sectPr()].join("");
    // Close enough to be re-paired into text-changed, different enough to be a change.
    const after = [p("Иванов Иван Иванович 2027"), sectPr()].join("");
    expect(kinds(await gate(before, after, { allowTextNormalization: true }))).toEqual(["text-changed"]);
  });

  it("A4: an unrecognisable rewrite is a removal plus an insertion", async () => {
    const before = [p("Иванов Иван Иванович"), sectPr()].join("");
    const after = [p("Петров Пётр Петрович"), sectPr()].join("");
    expect(kinds(await gate(before, after, { allowTextNormalization: true }))).toEqual([
      "block-inserted",
      "block-removed",
    ]);
  });

  it("A6: a PAGE field may change its switches", async () => {
    const before = { body: [p("Титул"), sectPr()].join(""), footers: { "footer1.xml": `<w:p>${field("PAGE \\* MERGEFORMAT")}</w:p>` } };
    const after = { body: [p("Титул"), sectPr()].join(""), footers: { "footer1.xml": `<w:p>${field("PAGE \\* ROMAN")}</w:p>` } };
    expect((await gate(before, after)).pass).toBe(true);
  });
});

describe("gate — hard failures", () => {
  it("dropped footnote reference", async () => {
    const before = [`<w:p><w:r><w:footnoteReference w:id="2"/></w:r><w:r><w:t>Сноска</w:t></w:r></w:p>`, sectPr()].join("");
    const after = [p("Сноска"), sectPr()].join("");
    const result = await gate(before, after);
    expect(kinds(result)).toContain("count");
    expect(result.violations.some((v) => v.message.includes("w:footnoteReference"))).toBe(true);
  });

  it("flattened nested table", async () => {
    const inner = `<w:tbl><w:tblGrid><w:gridCol w:w="50"/></w:tblGrid><w:tr><w:tc>${p("внутри")}</w:tc></w:tr></w:tbl>`;
    const outer = (nested: string) =>
      `<w:tbl><w:tblGrid><w:gridCol w:w="100"/></w:tblGrid><w:tr><w:tc>${p("ячейка")}${nested}</w:tc></w:tr></w:tbl>`;
    const result = await gate([outer(inner), sectPr()].join(""), [outer(""), sectPr()].join(""));
    expect(result.violations.some((v) => v.kind === "count" && v.message.includes("w:tbl 2 → 1"))).toBe(true);
  });

  it("lost gridSpan", async () => {
    const result = await gate([TABLE(true), sectPr()].join(""), [TABLE(false), sectPr()].join(""));
    expect(kinds(result)).toEqual(["table-shape"]);
  });

  it("changed REF bookmark target", async () => {
    const before = [ANCHOR, REF_P("_Toc1"), sectPr()].join("");
    const after = [ANCHOR, REF_P("_Toc2"), sectPr()].join("");
    const result = await gate(before, after);
    expect(kinds(result)).toContain("field");
    expect(kinds(result)).toContain("dangling-ref");
  });

  it("removed bookmark that a REF points to", async () => {
    const before = [ANCHOR, REF_P("_Toc1"), sectPr()].join("");
    const after = [p("Введение"), REF_P("_Toc1"), sectPr()].join("");
    const result = await gate(before, after);
    expect(kinds(result)).toContain("bookmark-missing");
    expect(kinds(result)).toContain("dangling-ref");
  });

  it("removed w:cols", async () => {
    const before = [p("Титул"), sectPr('<w:cols w:num="2"/>')].join("");
    const after = [p("Титул"), sectPr()].join("");
    const result = await gate(before, after);
    expect(kinds(result)).toEqual(["section"]);
    expect(result.violations[0].message).toContain("colsNum");
  });

  it("changed orientation", async () => {
    const before = [p("Титул"), `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr>`].join("");
    const after = [p("Титул"), `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`].join("");
    expect((await gate(before, after)).violations[0].message).toContain("orient");
  });

  it("deleted non-empty paragraph", async () => {
    const after = [p("Титул"), ANCHOR, TABLE(), sectPr()].join("");
    expect(kinds(await gate(BASE, after))).toEqual(["block-removed"]);
  });

  it("missing media file", async () => {
    const body = [p("Титул"), sectPr()].join("");
    const result = await gate({ body, media: { "image1.png": "PNGDATA" } }, { body });
    expect(kinds(result)).toEqual(["media", "rel"]);
  });

  it("m:oMath count decrease", async () => {
    const before = [`<w:p><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>`, sectPr()].join("");
    const after = ["<w:p/>", sectPr()].join("");
    const result = await gate(before, after);
    expect(result.violations.some((v) => v.kind === "count" && v.message.includes("m:oMath"))).toBe(true);
  });
});

describe("assertGate", () => {
  it("throws FidelityGateError carrying the diff", async () => {
    const a = await computeFingerprint(await buildDocx(spec(BASE)));
    const b = await computeFingerprint(await buildDocx(spec([p("Титул"), ANCHOR, TABLE(), sectPr()].join(""))));
    try {
      assertGate(a, b);
      expect.unreachable("gate should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FidelityGateError);
      expect((error as FidelityGateError).diff.entries.length).toBeGreaterThan(0);
    }
  });

  it("returns the result when the gate passes", async () => {
    const a = await computeFingerprint(await buildDocx(spec(BASE)));
    expect(assertGate(a, a).pass).toBe(true);
  });
});
