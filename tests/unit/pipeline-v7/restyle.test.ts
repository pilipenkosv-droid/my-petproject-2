import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildDocxXml,
  children,
  findChild,
  getAttr,
  parseDocxXml,
  tagName,
  type OrderedXmlNode,
} from "@/lib/xml/docx-xml";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import { walkBlocks, paragraphText } from "@/lib/pipeline-v7/docx/walk";
import { W_PPR_ORDER } from "@/lib/pipeline-v7/restyle/ooxml-order";
import { restyleParagraph } from "@/lib/pipeline-v7/restyle/paragraph";
import { restyleRuns } from "@/lib/pipeline-v7/restyle/runs";
import { restyleSectionsIn } from "@/lib/pipeline-v7/restyle/sections";
import { restyleTable } from "@/lib/pipeline-v7/restyle/tables";
import { upsertCanonicalStyles } from "@/lib/pipeline-v7/restyle/styles-writer";
import { restyleDocument } from "@/lib/pipeline-v7/restyle";
import { buildPackSpec, mmToTwips } from "@/lib/pipeline-v7/restyle/spec";
import { W_SECTPR_ORDER } from "@/lib/pipeline-v7/docx/sectpr";
import { miniPackage, W_NS as NS } from "./helpers/mini-docx";

const PACK = GOST_7_32;

const ser = (node: OrderedXmlNode | undefined): string =>
  node === undefined ? "<missing>" : buildDocxXml([node]);

function parseP(inner: string): OrderedXmlNode {
  return parseDocxXml(`<w:p ${NS}>${inner}</w:p>`).find((n) => "w:p" in n)!;
}

function assertOrder(parent: OrderedXmlNode | undefined, order: readonly string[]): void {
  expect(parent).toBeDefined();
  const ranks = children(parent!)
    .map((c) => order.indexOf(tagName(c) ?? ""))
    .filter((r) => r >= 0);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
}

const pPrOf = (p: OrderedXmlNode) => findChild(p, "w:pPr");
const prop = (parent: OrderedXmlNode | undefined, tag: string) =>
  parent ? findChild(parent, tag) : undefined;
const val = (parent: OrderedXmlNode | undefined, tag: string, attr = "w:val") => {
  const node = prop(parent, tag);
  return node ? getAttr(node, attr) : undefined;
};

const packageWithStyles = (body: string, styles: string): Promise<DocxPackage> =>
  miniPackage({ body, styles });

const stylesRoot = async (pkg: DocxPackage) =>
  (await pkg.part("word/styles.xml"))!.find((n) => "w:styles" in n)!;

const styleById = (root: OrderedXmlNode, id: string) =>
  children(root).find((s) => "w:style" in s && getAttr(s, "w:styleId") === id);

describe("styles-writer", () => {
  const CUSTOM =
    '<w:style w:type="paragraph" w:styleId="MyOwn"><w:name w:val="My Own"/>' +
    '<w:pPr><w:jc w:val="right"/></w:pPr></w:style>';
  const HEADING1 = '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>';

  it("is idempotent and leaves foreign styles byte-identical", async () => {
    const pkg = await packageWithStyles("<w:p/>", CUSTOM + HEADING1);
    const before = ser(styleById(await stylesRoot(pkg), "MyOwn"));
    await upsertCanonicalStyles(pkg, PACK);
    const once = buildDocxXml([await stylesRoot(pkg)]);
    await upsertCanonicalStyles(pkg, PACK);
    expect(buildDocxXml([await stylesRoot(pkg)])).toBe(once);
    expect(ser(styleById(await stylesRoot(pkg), "MyOwn"))).toBe(before);
  });

  it("creates the Dpx family and gives built-in Heading1 an outline level", async () => {
    const pkg = await packageWithStyles("<w:p/>", HEADING1);
    const res = await upsertCanonicalStyles(pkg, PACK);
    expect(res.missingPart).toBe(false);
    const root = await stylesRoot(pkg);
    for (const id of ["DpxBody", "DpxHeading1", "DpxCaption", "DpxTableCell", "DpxBibliography"]) {
      expect(styleById(root, id), id).toBeDefined();
    }
    const h1 = styleById(root, "Heading1")!;
    expect(val(prop(h1, "w:pPr"), "w:outlineLvl")).toBe("0");
    expect(getAttr(h1, "w:styleId")).toBe("Heading1");
  });

  it("creates docDefaults when the part has none", async () => {
    const pkg = await packageWithStyles("<w:p/>", "");
    await upsertCanonicalStyles(pkg, PACK);
    const dd = prop(await stylesRoot(pkg), "w:docDefaults")!;
    const rPr = prop(prop(dd, "w:rPrDefault"), "w:rPr");
    expect(val(rPr, "w:rFonts", "w:ascii")).toBe("Times New Roman");
    expect(val(rPr, "w:sz")).toBe("28");
    expect(val(prop(prop(dd, "w:pPrDefault"), "w:pPr"), "w:spacing", "w:line")).toBe("360");
  });
});

describe("sections", () => {
  const LANDSCAPE =
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' +
    '<w:pgMar w:top="1" w:right="1" w:bottom="1" w:left="1" w:header="720"/>' +
    '<w:cols w:num="2"/><w:titlePg/></w:sectPr>';

  it("rotates margins with the sheet and keeps cols, titlePg and header distance", () => {
    const nodes = parseDocxXml(`<w:body ${NS}>${LANDSCAPE}</w:body>`);
    expect(restyleSectionsIn(nodes, buildPackSpec(PACK))).toBe(1);
    const sect = findChild(nodes.find((n) => "w:body" in n)!, "w:sectPr")!;
    const pgMar = prop(sect, "w:pgMar")!;
    expect(getAttr(pgMar, "w:top")).toBe(String(mmToTwips(30)));
    expect(getAttr(pgMar, "w:bottom")).toBe(String(mmToTwips(10)));
    expect(getAttr(pgMar, "w:left")).toBe(String(mmToTwips(20)));
    expect(getAttr(pgMar, "w:header")).toBe("720");
    const pgSz = prop(sect, "w:pgSz")!;
    expect(getAttr(pgSz, "w:orient")).toBe("landscape");
    expect(getAttr(pgSz, "w:w")).toBe(String(mmToTwips(297)));
    expect(getAttr(pgSz, "w:h")).toBe(String(mmToTwips(210)));
    expect(val(sect, "w:cols", "w:num")).toBe("2");
    expect(prop(sect, "w:titlePg")).toBeDefined();
    assertOrder(sect, W_SECTPR_ORDER);
  });
});

describe("paragraph", () => {
  it("writes pStyle, spacing, ind and jc in schema order", () => {
    const p = parseP('<w:pPr><w:keepNext/><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:t>x</w:t></w:r>');
    expect(restyleParagraph(p, "body", PACK)).toBe(true);
    const pPr = pPrOf(p)!;
    expect(val(pPr, "w:pStyle")).toBe("DpxBody");
    expect(val(pPr, "w:spacing", "w:line")).toBe("360");
    expect(val(pPr, "w:spacing", "w:lineRule")).toBe("auto");
    expect(val(pPr, "w:ind", "w:firstLine")).toBe(String(mmToTwips(12.5)));
    expect(val(pPr, "w:jc")).toBe("both");
    expect(prop(pPr, "w:keepNext")).toBeDefined();
    assertOrder(pPr, W_PPR_ORDER);
  });

  it("leaves indents to numbering on a list item", () => {
    const p = parseP('<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr>');
    restyleParagraph(p, "list_item", PACK);
    const pPr = pPrOf(p)!;
    expect(prop(pPr, "w:numPr")).toBeDefined();
    expect(prop(pPr, "w:ind")).toBeUndefined();
    assertOrder(pPr, W_PPR_ORDER);
  });

  it("breaks the page before an L1 heading and drops conflicting direct props", () => {
    const p = parseP('<w:pPr><w:shd w:val="clear" w:fill="FF0000"/><w:pBdr><w:top/></w:pBdr></w:pPr>');
    restyleParagraph(p, "heading_L1", PACK);
    const pPr = pPrOf(p)!;
    expect(prop(pPr, "w:pageBreakBefore")).toBeDefined();
    expect(val(pPr, "w:outlineLvl")).toBe("0");
    expect(prop(pPr, "w:shd")).toBeUndefined();
    expect(prop(pPr, "w:pBdr")).toBeUndefined();
    assertOrder(pPr, W_PPR_ORDER);
  });

  it("aligns captions per pack and never touches title-page layout", () => {
    const fig = parseP("");
    const tbl = parseP("");
    restyleParagraph(fig, "figure_caption", PACK);
    restyleParagraph(tbl, "table_caption", PACK);
    expect(val(pPrOf(fig), "w:jc")).toBe("center");
    expect(val(pPrOf(tbl), "w:jc")).toBe("left");
    const title = parseP('<w:pPr><w:jc w:val="center"/></w:pPr>');
    const before = ser(title);
    expect(restyleParagraph(title, "title_page", PACK)).toBe(false);
    expect(ser(title)).toBe(before);
  });
});

describe("runs", () => {
  const RUN =
    '<w:r><w:rPr><w:b/><w:i/><w:vertAlign w:val="superscript"/><w:color w:val="FF0000"/>' +
    '<w:highlight w:val="yellow"/><w:rFonts w:ascii="Arial" w:asciiTheme="minorHAnsi"/>' +
    '</w:rPr><w:t>текст</w:t></w:r>';

  it("keeps emphasis, drops colour and theme fonts in body text", () => {
    const p = parseP(RUN);
    expect(restyleRuns(p, "body", PACK)).toBe(1);
    const rPr = findChild(findChild(p, "w:r")!, "w:rPr")!;
    expect(prop(rPr, "w:b")).toBeDefined();
    expect(prop(rPr, "w:i")).toBeDefined();
    expect(val(rPr, "w:vertAlign")).toBe("superscript");
    expect(prop(rPr, "w:color")).toBeUndefined();
    expect(prop(rPr, "w:highlight")).toBeUndefined();
    expect(val(rPr, "w:rFonts", "w:ascii")).toBe("Times New Roman");
    expect(getAttr(prop(rPr, "w:rFonts")!, "w:asciiTheme")).toBeUndefined();
    expect(val(rPr, "w:sz")).toBe("28");
  });

  it("keeps the colour of a hyperlink run", () => {
    const p = parseP(`<w:hyperlink r:id="rId5">${RUN}</w:hyperlink>`);
    restyleRuns(p, "body", PACK);
    const rPr = findChild(findChild(findChild(p, "w:hyperlink")!, "w:r")!, "w:rPr")!;
    expect(val(rPr, "w:color")).toBe("FF0000");
  });

  it("removes underline and forces bold in a heading", () => {
    const p = parseP('<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>ВВЕДЕНИЕ</w:t></w:r>');
    restyleRuns(p, "heading_L1", PACK);
    const rPr = findChild(findChild(p, "w:r")!, "w:rPr")!;
    expect(prop(rPr, "w:u")).toBeUndefined();
    expect(prop(rPr, "w:b")).toBeDefined();
  });

  it("never enters math, deletions or text boxes, and never rewrites w:t", () => {
    const p = parseP(
      '<m:oMath><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>x</m:t></m:r></m:oMath>' +
        '<w:del><w:r><w:delText>ушло</w:delText></w:r></w:del>' +
        '<w:r><w:t xml:space="preserve"> хвост </w:t></w:r>'
    );
    const mathBefore = ser(findChild(p, "m:oMath"));
    const delBefore = ser(findChild(p, "w:del"));
    const textBefore = collectT(p);
    expect(restyleRuns(p, "body", PACK)).toBe(1);
    expect(ser(findChild(p, "m:oMath"))).toBe(mathBefore);
    expect(ser(findChild(p, "w:del"))).toBe(delBefore);
    expect(collectT(p)).toEqual(textBefore);
  });

  it("touches only font and size on a field run", () => {
    const p = parseP('<w:r><w:rPr><w:color w:val="0000FF"/></w:rPr><w:instrText>PAGE</w:instrText></w:r>');
    restyleRuns(p, "body", PACK);
    const rPr = findChild(findChild(p, "w:r")!, "w:rPr")!;
    expect(val(rPr, "w:color")).toBe("0000FF");
    expect(val(rPr, "w:sz")).toBe("28");
  });
});

function collectT(node: OrderedXmlNode, out: string[] = []): string[] {
  for (const child of children(node)) {
    if (tagName(child) === "w:t") out.push(ser(child));
    else if (tagName(child)) collectT(child, out);
  }
  return out;
}

describe("tables", () => {
  const TBL =
    "<w:tbl><w:tblPr><w:tblW w:w=\"9000\" w:type=\"dxa\"/></w:tblPr>" +
    '<w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>' +
    '<w:tr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/><w:gridSpan w:val="2"/>' +
    '<w:vMerge w:val="restart"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>';

  it("keeps an explicit dxa width and never touches the grid or the cells", () => {
    const nodes = parseDocxXml(`<w:body ${NS}>${TBL}</w:body>`);
    const tbl = findChild(nodes.find((n) => "w:body" in n)!, "w:tbl")!;
    const gridBefore = ser(findChild(tbl, "w:tblGrid"));
    const rowBefore = ser(findChild(tbl, "w:tr"));
    restyleTable(tbl);
    const tblPr = findChild(tbl, "w:tblPr")!;
    expect(val(tblPr, "w:tblW", "w:type")).toBe("dxa");
    expect(val(tblPr, "w:tblW", "w:w")).toBe("9000");
    expect(val(tblPr, "w:jc")).toBe("center");
    expect(ser(findChild(tbl, "w:tblGrid"))).toBe(gridBefore);
    expect(ser(findChild(tbl, "w:tr"))).toBe(rowBefore);
  });

  it("gives a width-less table the full text column", () => {
    const nodes = parseDocxXml(`<w:body ${NS}><w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl></w:body>`);
    const tbl = findChild(nodes.find((n) => "w:body" in n)!, "w:tbl")!;
    restyleTable(tbl);
    const tblPr = findChild(tbl, "w:tblPr")!;
    expect(val(tblPr, "w:tblW", "w:type")).toBe("pct");
    expect(val(tblPr, "w:tblW", "w:w")).toBe("5000");
    expect(tagName(children(tbl)[0])).toBe("w:tblPr");
  });
});
