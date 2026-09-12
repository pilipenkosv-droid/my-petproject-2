import { describe, it, expect } from "vitest";
import { parseDocxXml, buildDocxXml } from "@/lib/xml/docx-xml";
import { walkBlocks, paragraphText } from "@/lib/pipeline-v7/docx/walk";

const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"`;
const doc = (body: string) => parseDocxXml(`<w:document ${W}><w:body>${body}</w:body></w:document>`);
const p = (text = "x") => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe("walkBlocks", () => {
  it("yields top-level paragraphs and tables in document order", () => {
    const blocks = [...walkBlocks(doc(`${p("a")}<w:tbl><w:tr><w:tc>${p("b")}</w:tc></w:tr></w:tbl>${p("c")}`))];
    expect(blocks.map((b) => b.kind)).toEqual(["p", "tbl", "p", "p"]);
    expect(blocks.map((b) => paragraphText(b.node)).filter(Boolean)).toEqual(["a", "b", "c"]);
  });

  it("counts table nesting depth", () => {
    const inner = `<w:tbl><w:tr><w:tc>${p("deep")}</w:tc></w:tr></w:tbl>`;
    const blocks = [...walkBlocks(doc(`<w:tbl><w:tr><w:tc>${p("shallow")}${inner}</w:tc></w:tr></w:tbl>`))];
    const byText = new Map(blocks.filter((b) => b.kind === "p").map((b) => [paragraphText(b.node), b]));
    expect(blocks.filter((b) => b.kind === "tbl").map((b) => b.inTableDepth)).toEqual([0, 1]);
    expect(byText.get("shallow")!.inTableDepth).toBe(1);
    expect(byText.get("deep")!.inTableDepth).toBe(2);
  });

  it("descends into w:sdt/w:sdtContent", () => {
    const blocks = [...walkBlocks(doc(`<w:sdt><w:sdtPr/><w:sdtContent>${p("toc")}</w:sdtContent></w:sdt>`))];
    expect(blocks).toHaveLength(1);
    expect(paragraphText(blocks[0].node)).toBe("toc");
    expect(blocks[0].path).toContain("w:sdtContent");
  });

  it("yields a text-box paragraph exactly once, with its own path", () => {
    const box = `<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent>${p("inbox")}</w:txbxContent></v:textbox></v:shape></w:pict></w:r><w:r><w:t>outer</w:t></w:r></w:p>`;
    const blocks = [...walkBlocks(doc(box))];
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => paragraphText(b.node))).toEqual(["outer", "inbox"]);
    expect(new Set(blocks.map((b) => b.path)).size).toBe(2);
    expect(new Set(blocks.map((b) => b.node)).size).toBe(2);
  });

  it("descends into w:ins, w:del, w:smartTag and w:customXml", () => {
    const body = `<w:ins>${p("ins")}</w:ins><w:del>${p("del")}</w:del><w:customXml>${p("cx")}</w:customXml>`;
    expect([...walkBlocks(doc(body))].map((b) => paragraphText(b.node))).toEqual(["ins", "del", "cx"]);
  });

  it("reports parent and depth of each block", () => {
    const blocks = [...walkBlocks(doc(p("a")))];
    expect(blocks[0].parent["w:body"]).toBeDefined();
    expect(blocks[0].depth).toBe(2);
    expect(blocks[0].path).toBe("w:document[0]/w:body[0]/w:p[0]");
  });

  it("does not mutate the tree it walks", () => {
    const xml = `<w:document ${W}><w:body>${p("a")}<w:tbl><w:tr><w:tc>${p("b")}</w:tc></w:tr></w:tbl></w:body></w:document>`;
    const ast = parseDocxXml(xml);
    void [...walkBlocks(ast)];
    expect(buildDocxXml(ast)).toContain("<w:tbl>");
  });
});

describe("paragraphText", () => {
  it("maps tabs, breaks, hyphens and symbols", () => {
    const [b] = [...walkBlocks(doc(`<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:noBreakHyphen/><w:sym w:char="F0B7"/><w:t>c</w:t></w:r></w:p>`))];
    expect(paragraphText(b.node)).toBe("a\tb\n‑\ufffcc");
  });

  it("preserves xml:space text verbatim and concatenates runs in order", () => {
    const [b] = [...walkBlocks(doc(`<w:p><w:r><w:t xml:space="preserve">a  </w:t></w:r><w:r><w:t xml:space="preserve"> b</w:t></w:r></w:p>`))];
    expect(paragraphText(b.node)).toBe("a   b");
  });

  it("includes w:hyperlink, w:ins, w:smartTag and w:fldSimple runs", () => {
    const body = `<w:p><w:hyperlink><w:r><w:t>link</w:t></w:r></w:hyperlink><w:ins><w:r><w:t>+</w:t></w:r></w:ins><w:smartTag><w:r><w:t>tag</w:t></w:r></w:smartTag><w:fldSimple><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>`;
    const [b] = [...walkBlocks(doc(body))];
    expect(paragraphText(b.node)).toBe("link+tag1");
  });

  it("excludes deleted text and text-box paragraphs", () => {
    const body = `<w:p><w:r><w:t>keep</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del><w:r><w:pict><v:textbox><w:txbxContent>${p("boxed")}</w:txbxContent></v:textbox></w:pict></w:r></w:p>`;
    const [outer] = [...walkBlocks(doc(body))];
    expect(paragraphText(outer.node)).toBe("keep");
  });

  it("ignores w:pPr content", () => {
    const [b] = [...walkBlocks(doc(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>h</w:t></w:r></w:p>`))];
    expect(paragraphText(b.node)).toBe("h");
  });
});

// Smoke check against the real corpus: the traversal must survive every
// construct these documents actually contain.
import fs from "fs";
import path from "path";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { enumerateSectPr, getPgMar } from "@/lib/pipeline-v7/docx/sectpr";

const REAL = "/Users/sergejpilipenko/diplox/data/corpus/real";
const realFiles = fs.existsSync(REAL) ? fs.readdirSync(REAL).filter((f) => f.endsWith(".docx")) : [];

describe.skipIf(realFiles.length === 0)("real corpus smoke", () => {
  it("walks every content part and finds a body sectPr with margins", async () => {
    for (const f of realFiles) {
      const pkg = await DocxPackage.load(fs.readFileSync(path.join(REAL, f)));
      let blocks = 0;
      for (const ref of await pkg.contentParts()) {
        const ast = (await pkg.part(ref.name))!;
        for (const b of walkBlocks(ast)) {
          blocks++;
          if (b.kind === "p") void paragraphText(b.node);
        }
      }
      expect(blocks, `${f} yielded no blocks`).toBeGreaterThan(0);

      const main = (await pkg.contentParts()).find((c) => c.kind === "document")!;
      const body = enumerateSectPr((await pkg.part(main.name))!).filter((s) => s.scope === "body");
      expect(body.length, `${f} body sectPr count`).toBe(1);
      expect(getPgMar(body[0].node), `${f} pgMar`).toBeDefined();
    }
  }, 60000);
});
