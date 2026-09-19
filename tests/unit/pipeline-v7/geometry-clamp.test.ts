/**
 * A4/A5: bringing overflowing tables and pictures back inside the text column.
 *
 * Both rules are read by the checker off a single attribute, so the assertions
 * are on the attribute — and, for a picture, on the ratio, which is the part a
 * naive clamp gets wrong.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { restyleTable } from "@/lib/pipeline-v7/restyle";
import { scaleImages } from "@/lib/pipeline-v7/aux";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { children, findChild, getAttr, parseDocxXml, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { W_NS } from "./helpers/mini-docx";

/** ГОСТ A4 column: 210 − 30 − 10 mm. */
const TEXT_WIDTH_TW = 9638;

function table(tblW: string): OrderedXmlNode {
  const xml = `<w:root ${W_NS}><w:tbl><w:tblPr>${tblW}<w:jc w:val="center"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="4800"/><w:gridCol w:w="4800"/></w:tblGrid>` +
    `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl></w:root>`;
  return findChild(parseDocxXml(xml).find((n) => "w:root" in n)!, "w:tbl")!;
}

const widthOf = (tbl: OrderedXmlNode) => {
  const w = findChild(findChild(tbl, "w:tblPr")!, "w:tblW")!;
  return { type: getAttr(w, "w:type"), w: getAttr(w, "w:w") };
};

describe("restyle/tables — ширина таблицы (A4)", () => {
  it("режет процент больше 100 % до 5000", () => {
    const t = table('<w:tblW w:w="5450" w:type="pct"/>');
    restyleTable(t, TEXT_WIDTH_TW);
    expect(widthOf(t)).toEqual({ type: "pct", w: "5000" });
  });

  it("переводит абсолютную ширину шире колонки в 100 %", () => {
    const t = table('<w:tblW w:w="10448" w:type="dxa"/>');
    restyleTable(t, TEXT_WIDTH_TW);
    expect(widthOf(t)).toEqual({ type: "pct", w: "5000" });
  });

  it("не трогает абсолютную ширину, которая помещается", () => {
    const t = table('<w:tblW w:w="9600" w:type="dxa"/>');
    restyleTable(t, TEXT_WIDTH_TW);
    expect(widthOf(t)).toEqual({ type: "dxa", w: "9600" });
  });

  it("не расширяет узкую таблицу", () => {
    const t = table('<w:tblW w:w="2500" w:type="pct"/>');
    restyleTable(t, TEXT_WIDTH_TW);
    expect(widthOf(t)).toEqual({ type: "pct", w: "2500" });
  });
});

/** A one-paragraph document whose only content is one inline drawing. */
async function docxWithDrawing(cx: number, cy: number): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document ${W_NS} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:p><w:r><w:drawing>` +
      `<wp:inline><wp:extent cx="${cx}" cy="${cy}"/><a:graphic><a:graphicData>` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:spPr><a:xfrm>` +
      `<a:ext cx="${cx}" cy="${cy}"/></a:xfrm></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="1701" w:right="567"/></w:sectPr>` +
      `</w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Every cx/cy in the part, in document order. */
function extents(nodes: OrderedXmlNode[]): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  const visit = (n: OrderedXmlNode): void => {
    for (const child of children(n)) {
      const tag = tagName(child);
      if (tag === "wp:extent" || tag === "a:ext") {
        out.push({ cx: Number(getAttr(child, "cx")), cy: Number(getAttr(child, "cy")) });
      }
      if (tag !== undefined) visit(child);
    }
  };
  for (const n of nodes) visit(n);
  return out;
}

describe("aux/images — масштабирование рисунков (A5)", () => {
  /** The checker's ceiling, 165 mm. */
  const CAP = 165 * 36000;

  it("ужимает рисунок шире колонки, сохраняя пропорции", async () => {
    const pkg = await DocxPackage.load(await docxWithDrawing(8559165, 4667250));
    expect(await scaleImages(pkg)).toBe(1);
    const found = extents((await pkg.part("word/document.xml"))!);
    expect(found.length).toBe(2);
    for (const e of found) {
      expect(e.cx).toBe(CAP);
      // 4667250 / 8559165 ≈ 0.5453 — тот же множитель применён к высоте.
      expect(e.cy).toBe(Math.round(4667250 * (CAP / 8559165)));
    }
  });

  it("ужимает и тот рисунок, что влезает в колонку, но шире лимита чекера", async () => {
    // Колонка ГОСТ 7.32 — 170 мм, лимит правила — 165 мм; берём меньший.
    const pkg = await DocxPackage.load(await docxWithDrawing(6061075, 2556163));
    expect(await scaleImages(pkg)).toBe(1);
    expect(extents((await pkg.part("word/document.xml"))!)[0].cx).toBe(CAP);
  });

  it("не трогает рисунок, который уже помещается", async () => {
    const pkg = await DocxPackage.load(await docxWithDrawing(3000000, 2000000));
    expect(await scaleImages(pkg)).toBe(0);
    expect(extents((await pkg.part("word/document.xml"))!)[0]).toEqual({ cx: 3000000, cy: 2000000 });
  });

  it("идемпотентен: второй проход ничего не меняет", async () => {
    const pkg = await DocxPackage.load(await docxWithDrawing(8559165, 4667250));
    await scaleImages(pkg);
    const once = extents((await pkg.part("word/document.xml"))!);
    expect(await scaleImages(pkg)).toBe(0);
    expect(extents((await pkg.part("word/document.xml"))!)).toEqual(once);
  });
});
