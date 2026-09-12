import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { computeFingerprint } from "@/lib/pipeline-v7/fingerprint/compute";
import { evaluateGate } from "@/lib/pipeline-v7/fingerprint/gate";
import { normalizeText, normalizeInstr, looseEqual } from "@/lib/pipeline-v7/fingerprint/normalize";
import { alignSequences } from "@/lib/pipeline-v7/fingerprint/align";
import { buildDocx, p, field, sectPr } from "./helpers/fp-docx";

const REAL_CORPUS = "/Users/sergejpilipenko/diplox/data/corpus/real";
const MAIN = "word/document.xml";

describe("normalizeText", () => {
  const cases: [string, string][] = [
    ["  \u0434\u0432\u043e\u0439\u043d\u044b\u0435   \u043f\u0440\u043e\u0431\u0435\u043b\u044b  ", "\u0434\u0432\u043e\u0439\u043d\u044b\u0435 \u043f\u0440\u043e\u0431\u0435\u043b\u044b"],
    ["\u043d\u0435\u0440\u0430\u0437\u00a0\u0440\u044b\u0432\u043d\u044b\u0439", "\u043d\u0435\u0440\u0430\u0437 \u0440\u044b\u0432\u043d\u044b\u0439"],
    ["\u0441\u0442\u0440\u043e\u043a\u0430\n\n\u043f\u0435\u0440\u0435\u043d\u043e\u0441", "\u0441\u0442\u0440\u043e\u043a\u0430\n\u043f\u0435\u0440\u0435\u043d\u043e\u0441"],
    ["\u0442\u0430\u0431\t\u0443\u043b\u044f\u0446\u0438\u044f", "\u0442\u0430\u0431\t\u0443\u043b\u044f\u0446\u0438\u044f"],
    ["1  \u0412\u0432\u0435\u0434\u0435\u043d\u0438\u0435\t  5", "1 \u0412\u0432\u0435\u0434\u0435\u043d\u0438\u0435\t 5"],
    ["", ""],
    ["e\u0301", "e\u0301".normalize("NFC")],
  ];
  for (const [input, expected] of cases) {
    it(`normalises ${JSON.stringify(input)}`, () => expect(normalizeText(input)).toBe(expected));
  }
  it("composes decomposed characters", () => {
    expect(normalizeText("\u0439")).toBe("\u0438\u0306".normalize("NFC"));
  });
});

describe("normalizeInstr", () => {
  it("keeps arguments of reference fields", () => {
    expect(normalizeInstr(' ref  _Ref1   \\h ')).toBe("REF _REF1 \\H");
  });
  it("strips arguments of presentation fields", () => {
    expect(normalizeInstr("PAGE \\* MERGEFORMAT")).toBe("PAGE");
    expect(normalizeInstr('TOC \\o "1-3" \\h')).toBe("TOC");
  });
});

describe("looseEqual", () => {
  it("accepts quote and dash normalisation", () => {
    expect(looseEqual("«Тема» 10–12", '"Тема" 10-12')).toBe(true);
  });
  it("rejects a real text change", () => {
    expect(looseEqual("Иванов", "Петров")).toBe(false);
  });
});

describe("alignSequences", () => {
  it("reports one insertion instead of N changes", () => {
    const a = ["a", "b", "c", "d"];
    const ops = alignSequences(a, ["a", "b", "x", "c", "d"]);
    expect(ops.filter((o) => o.op !== "equal")).toEqual([{ op: "insert", b: 2 }]);
  });
  it("stays fast on 5000 blocks with scattered edits", () => {
    const a = Array.from({ length: 5000 }, (_, i) => `b${i}`);
    const b = a.filter((_, i) => i % 200 !== 7).flatMap((x, i) => (i % 250 === 3 ? [x, "new"] : [x]));
    const started = Date.now();
    const ops = alignSequences(a, b);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(ops.filter((o) => o.op === "delete")).toHaveLength(25);
    expect(ops.filter((o) => o.op === "insert")).toHaveLength(20);
  });

  it("covers every index of both sides", () => {
    const ops = alignSequences(["a", "b", "c"], ["b", "z"]);
    expect(ops.filter((o) => o.op !== "insert").length).toBe(3);
    expect(ops.filter((o) => o.op !== "delete").length).toBe(2);
  });
});

const SAMPLE = [
  p("Заголовок"),
  `<w:p><w:r><w:t>Ссылка </w:t></w:r>${field("REF _Ref1 \\h", "1")}</w:p>`,
  `<w:p><w:bookmarkStart w:id="1" w:name="_Ref1"/><w:r><w:t>Цель</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>`,
  `<w:tbl><w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="100"/></w:tblGrid>` +
    `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${p("шапка")}</w:tc></w:tr>` +
    `<w:tr><w:tc>${p("левая")}</w:tc><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>${p("правая")}</w:tc></w:tr>` +
    `</w:tbl>`,
  `<w:p><w:r><w:footnoteReference w:id="2"/></w:r><w:r><w:t>Сноска</w:t></w:r></w:p>`,
  `<w:p><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>`,
  sectPr('<w:cols w:num="2" w:space="708"/>'),
].join("");

const sampleDocx = () =>
  buildDocx({
    body: SAMPLE,
    footnotes: `<w:footnote w:id="2">${p("текст сноски")}</w:footnote>`,
    footers: { "footer1.xml": `<w:p><w:r><w:t>стр. </w:t></w:r>${field("PAGE \\* MERGEFORMAT")}</w:p>` },
    media: { "image1.png": "PNGDATA" },
  });

describe("computeFingerprint", () => {
  it("counts markers by walking the AST, nested content included", async () => {
    const fp = await computeFingerprint(await sampleDocx());
    const counts = fp.parts[MAIN].counts;
    expect(counts["w:tbl"]).toBe(1);
    expect(counts["w:tc"]).toBe(3);
    expect(counts["w:footnoteReference"]).toBe(1);
    expect(counts["m:oMath"]).toBe(1);
    expect(counts["w:bookmarkStart"]).toBe(1);
    expect(counts["w:fldChar[begin]"]).toBe(1);
    expect(counts["w:sectPr"]).toBe(1);
  });

  it("prints blocks with text, depth and footnote ids", async () => {
    const fp = await computeFingerprint(await sampleDocx());
    const blocks = fp.parts[MAIN].blocks;
    expect(blocks.map((b) => b.kind)).toEqual(["p", "p", "p", "tbl", "p", "p", "p", "p", "p"]);
    const withNote = blocks.find((b) => b.kind === "p" && b.text === "Сноска");
    expect(withNote?.kind === "p" && withNote.footnoteIds).toEqual(["2"]);
    const inCell = blocks.find((b) => b.kind === "p" && b.text === "левая");
    expect(inCell?.kind === "p" && inCell.inTableDepth).toBe(1);
  });

  it("records table shape without widths", async () => {
    const fp = await computeFingerprint(await sampleDocx());
    expect(fp.parts[MAIN].tableShapes).toEqual([
      {
        gridCols: 2,
        gridColSum: 200,
        rows: [
          { cells: [{ gridSpan: 2, vMerge: null }] },
          { cells: [{ gridSpan: 1, vMerge: null }, { gridSpan: 1, vMerge: "restart" }] },
        ],
      },
    ]);
  });

  it("collects field instructions and bookmarks", async () => {
    const fp = await computeFingerprint(await sampleDocx());
    expect(fp.parts[MAIN].fieldInstrs).toEqual(["REF _REF1 \\H"]);
    expect(fp.parts[MAIN].bookmarks).toEqual(["_Ref1"]);
    expect(fp.parts["word/footer1.xml"].fieldInstrs).toEqual(["PAGE"]);
  });

  it("prints sections without page dimensions", async () => {
    const fp = await computeFingerprint(await sampleDocx());
    expect(fp.parts[MAIN].sections).toEqual([
      {
        pgSz: { w: 11906, h: 16838 },
        orient: "portrait",
        colsNum: 2,
        colsEqualWidth: true,
        type: null,
        headerRefTypes: [],
        footerRefTypes: [],
        titlePg: false,
      },
    ]);
  });

  it("covers every content part and the package level", async () => {
    const fp = await computeFingerprint(await sampleDocx());
    expect(Object.keys(fp.parts).sort()).toEqual([MAIN, "word/footer1.xml", "word/footnotes.xml"]);
    expect(fp.packageLevel.mediaFiles).toEqual(["word/media/image1.png:7"]);
    expect(fp.packageLevel.relTargets).toContain("word/_rels/document.xml.rels|footnotes.xml");
  });

  it("is identical for two computations of the same bytes", async () => {
    const buf = await sampleDocx();
    const a = await computeFingerprint(buf);
    const b = await computeFingerprint(buf);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(evaluateGate(a, b).pass).toBe(true);
  });

  it("survives an identity round-trip through DocxPackage", async () => {
    const buf = await sampleDocx();
    const pkg = await DocxPackage.load(buf);
    await pkg.part(MAIN);
    pkg.markDirty(MAIN);
    const saved = await pkg.save();
    const gate = evaluateGate(await computeFingerprint(buf), await computeFingerprint(saved));
    expect(gate.violations.map((x) => x.message)).toEqual([]);
    expect(gate.pass).toBe(true);
  });
});

function listDocx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".docx") && !f.startsWith("~$"))
    .map((f) => path.join(dir, f));
}

const realFiles = listDocx(REAL_CORPUS);

describe.skipIf(realFiles.length === 0)("real corpus smoke", () => {
  it("fingerprints are stable and self-identical under the gate", async () => {
    const timings: { file: string; ms: number }[] = [];
    const failures: string[] = [];
    for (const file of realFiles) {
      const buf = fs.readFileSync(file);
      const started = Date.now();
      const first = await computeFingerprint(buf);
      timings.push({ file: path.basename(file), ms: Date.now() - started });
      const second = await computeFingerprint(buf);
      if (JSON.stringify(first) !== JSON.stringify(second)) failures.push(`${path.basename(file)}: unstable`);
      const gate = evaluateGate(first, second);
      if (!gate.pass) failures.push(`${path.basename(file)}: ${gate.violations[0]?.message}`);
    }
    timings.sort((a, b) => b.ms - a.ms);
    const median = timings[Math.floor(timings.length / 2)];
    // eslint-disable-next-line no-console
    console.log(`fingerprint timing: max ${timings[0].ms}ms (${timings[0].file}), median ${median.ms}ms`);
    expect(failures).toEqual([]);
    expect(timings[0].ms).toBeLessThan(3000);
  }, 120000);
});
