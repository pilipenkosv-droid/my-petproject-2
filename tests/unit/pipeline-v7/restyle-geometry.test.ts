/**
 * Page geometry, table width and the paragraph properties the restyler is not
 * allowed to take away.
 */

import { describe, it, expect } from "vitest";
import { findChild, getAttr, parseDocxXml, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { restyleParagraph } from "@/lib/pipeline-v7/restyle/paragraph";
import { restyleSectionsIn } from "@/lib/pipeline-v7/restyle/sections";
import { restyleTable } from "@/lib/pipeline-v7/restyle/tables";
import { upsertCanonicalStyles } from "@/lib/pipeline-v7/restyle/styles-writer";
import { buildPackSpec, mmToTwips } from "@/lib/pipeline-v7/restyle/spec";
import { children } from "@/lib/xml/docx-xml";
import { miniPackage, W_NS as NS } from "./helpers/mini-docx";

const PACK = GOST_7_32;

function parseP(inner: string): OrderedXmlNode {
  return parseDocxXml(`<w:p ${NS}>${inner}</w:p>`).find((n) => "w:p" in n)!;
}

const pPrOf = (p: OrderedXmlNode) => findChild(p, "w:pPr");
const prop = (parent: OrderedXmlNode | undefined, tag: string) =>
  parent ? findChild(parent, tag) : undefined;
const val = (parent: OrderedXmlNode | undefined, tag: string, attr = "w:val") => {
  const node = prop(parent, tag);
  return node ? getAttr(node, attr) : undefined;
};
const stylesRoot = async (pkg: Awaited<ReturnType<typeof miniPackage>>) =>
  (await pkg.part("word/styles.xml"))!.find((n) => "w:styles" in n)!;
const styleById = (root: OrderedXmlNode, id: string) =>
  children(root).find((s) => "w:style" in s && getAttr(s, "w:styleId") === id);

describe("page size (C-2)", () => {
  const SPEC = buildPackSpec(PACK);
  const sect = (w: string, h: string, orient = "") =>
    parseDocxXml(`<w:body ${NS}><w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${orient}/></w:sectPr></w:body>`);
  const sizeOf = (nodes: OrderedXmlNode[]) => {
    const sectPr = findChild(nodes.find((n) => "w:body" in n)!, "w:sectPr")!;
    const pgSz = findChild(sectPr, "w:pgSz")!;
    return [getAttr(pgSz, "w:w"), getAttr(pgSz, "w:h")];
  };

  it("leaves exact A4 exactly as it was", () => {
    const nodes = sect("11906", "16838");
    restyleSectionsIn(nodes, SPEC);
    expect(sizeOf(nodes)).toEqual(["11906", "16838"]);
  });

  it("normalises a page within a millimetre of A4", () => {
    const nodes = sect("11900", "16840");
    restyleSectionsIn(nodes, SPEC);
    expect(sizeOf(nodes)).toEqual(["11906", "16838"]);
  });

  it("leaves A3 alone but still applies the margins", () => {
    const nodes = sect("16838", "23811");
    restyleSectionsIn(nodes, SPEC);
    expect(sizeOf(nodes)).toEqual(["16838", "23811"]);
    const sectPr = findChild(nodes.find((n) => "w:body" in n)!, "w:sectPr")!;
    expect(getAttr(findChild(sectPr, "w:pgMar")!, "w:left")).toBe(String(mmToTwips(SPEC.marginsMm.left)));
  });

  it("leaves Letter alone", () => {
    const nodes = sect("12240", "15840");
    restyleSectionsIn(nodes, SPEC);
    expect(sizeOf(nodes)).toEqual(["12240", "15840"]);
  });
});

describe("table width (C-1)", () => {
  const body = (inner: string) => {
    const nodes = parseDocxXml(`<w:body ${NS}>${inner}</w:body>`);
    return findChild(nodes.find((n) => "w:body" in n)!, "w:tbl")!;
  };
  const widthOf = (tbl: OrderedXmlNode) => {
    const tblPr = findChild(tbl, "w:tblPr");
    const w = tblPr ? findChild(tblPr, "w:tblW") : undefined;
    return w ? [getAttr(w, "w:type"), getAttr(w, "w:w")] : undefined;
  };

  it("does not stretch a table whose cells are measured in twips", () => {
    const tbl = body(
      '<w:tbl><w:tblGrid><w:gridCol w:w="4800"/><w:gridCol w:w="4800"/></w:tblGrid>' +
        '<w:tr><w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>'
    );
    restyleTable(tbl, 9638);
    expect(widthOf(tbl)).toBeUndefined();
  });

  it("does not stretch a grid narrower than 60 % of the text column", () => {
    const tbl = body('<w:tbl><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>');
    restyleTable(tbl, 9638);
    expect(widthOf(tbl)).toBeUndefined();
  });

  it("stretches a full-width grid with no stated widths", () => {
    const tbl = body(
      '<w:tbl><w:tblGrid><w:gridCol w:w="4800"/><w:gridCol w:w="4800"/></w:tblGrid>' +
        "<w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>"
    );
    restyleTable(tbl, 9638);
    expect(widthOf(tbl)).toEqual(["pct", "5000"]);
  });
});

describe("paragraph properties the restyler must not take away", () => {
  it("C-3: keeps a page break the student put on a body paragraph", () => {
    const p = parseP('<w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Текст</w:t></w:r>');
    restyleParagraph(p, "body", PACK);
    expect(prop(pPrOf(p), "w:pageBreakBefore")).toBeDefined();
  });

  it("C-4: adds no page break to the block right after a section break", () => {
    const p = parseP("<w:r><w:t>ВВЕДЕНИЕ</w:t></w:r>");
    restyleParagraph(p, "heading_L1", PACK, { spec: buildPackSpec(PACK), prevHasSectPr: true });
    expect(prop(pPrOf(p), "w:pageBreakBefore")).toBeUndefined();
  });

  it("C-5: keeps an outline level on a paragraph restyled as body", () => {
    const p = parseP('<w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>Текст</w:t></w:r>');
    restyleParagraph(p, "body", PACK);
    expect(val(pPrOf(p), "w:outlineLvl")).toBe("1");
    expect(val(pPrOf(p), "w:pStyle")).toBe("DpxBody");
  });

  it("C-9: a list item gets its own style, and that style has no w:ind", async () => {
    const p = parseP('<w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Пункт</w:t></w:r>');
    restyleParagraph(p, "list_item", PACK);
    expect(val(pPrOf(p), "w:pStyle")).toBe("DpxListItem");
    expect(prop(pPrOf(p), "w:ind")).toBeUndefined();

    const pkg = await miniPackage({ body: "<w:p/>", styles: "" });
    await upsertCanonicalStyles(pkg, PACK);
    const style = styleById(await stylesRoot(pkg), "DpxListItem")!;
    expect(prop(findChild(style, "w:pPr"), "w:ind")).toBeUndefined();
  });
});
