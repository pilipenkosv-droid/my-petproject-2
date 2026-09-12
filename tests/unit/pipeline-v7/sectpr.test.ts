import { describe, it, expect } from "vitest";
import { parseDocxXml, buildDocxXml } from "@/lib/xml/docx-xml";
import {
  enumerateSectPr,
  getPgSz,
  getPgMar,
  getOrient,
  getCols,
  getType,
  getHeaderFooterRefs,
  hasTitlePg,
  setPgMar,
  setPgSz,
} from "@/lib/pipeline-v7/docx/sectpr";

const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const doc = (body: string) => parseDocxXml(`<w:document ${W}><w:body>${body}</w:body></w:document>`);

const FULL_SECTPR = `<w:sectPr><w:headerReference w:type="first" r:id="rId7"/><w:footerReference w:type="default" r:id="rId8"/><w:type w:val="continuous"/><w:pgSz w:w="11906" w:h="16838" w:orient="landscape"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:num="2" w:space="708" w:equalWidth="0"/><w:titlePg/><w:docGrid w:linePitch="360"/></w:sectPr>`;

describe("enumerateSectPr", () => {
  it("finds the body-level sectPr and paragraph-level ones", () => {
    const refs = enumerateSectPr(
      doc(`<w:p><w:pPr><w:sectPr><w:pgSz w:w="1"/></w:sectPr></w:pPr></w:p><w:p/>${FULL_SECTPR}`)
    );
    expect(refs.map((r) => r.scope)).toEqual(["pPr", "body"]);
    expect(refs[0].paragraph).toBeDefined();
    expect(refs[1].paragraph).toBeUndefined();
  });

  it("finds a sectPr inside a table cell", () => {
    const cell = `<w:tbl><w:tr><w:tc><w:p><w:pPr><w:sectPr><w:pgSz w:w="99"/></w:sectPr></w:pPr></w:p></w:tc></w:tr></w:tbl>`;
    const refs = enumerateSectPr(doc(cell + FULL_SECTPR));
    expect(refs).toHaveLength(2);
    expect(refs[0].path).toContain("w:tc[0]");
    expect(getPgSz(refs[0].node)?.w).toBe("99");
  });

  it("finds a sectPr inside sdt and inside a text box", () => {
    const sdt = `<w:sdt><w:sdtContent><w:p><w:pPr><w:sectPr><w:type w:val="oddPage"/></w:sectPr></w:pPr></w:p></w:sdtContent></w:sdt>`;
    const box = `<w:p><w:r><w:pict><v:textbox><w:txbxContent><w:p><w:pPr><w:sectPr><w:type w:val="evenPage"/></w:sectPr></w:pPr></w:p></w:txbxContent></v:textbox></w:pict></w:r></w:p>`;
    const refs = enumerateSectPr(doc(sdt + box));
    expect(refs.map((r) => getType(r.node))).toEqual(["oddPage", "evenPage"]);
  });

  it("skips the revision snapshot inside w:sectPrChange", () => {
    const withChange = `<w:sectPr><w:pgSz w:w="11906"/><w:sectPrChange w:id="1"><w:sectPr><w:pgSz w:w="1"/></w:sectPr></w:sectPrChange></w:sectPr>`;
    const refs = enumerateSectPr(doc(withChange));
    expect(refs).toHaveLength(1);
    expect(getPgSz(refs[0].node)?.w).toBe("11906");
  });
});

describe("sectPr accessors", () => {
  const sect = () => enumerateSectPr(doc(FULL_SECTPR))[0].node;

  it("reads page size, orientation and margins", () => {
    expect(getPgSz(sect())).toEqual({ w: "11906", h: "16838", orient: "landscape", code: undefined });
    expect(getOrient(sect())).toBe("landscape");
    expect(getPgMar(sect())).toEqual({
      top: "1134", right: "850", bottom: "1134", left: "1701",
      header: "708", footer: "708", gutter: "0",
    });
  });

  it("reads columns, section type, header/footer refs and titlePg", () => {
    expect(getCols(sect())).toEqual({ num: 2, equalWidth: false, space: "708" });
    expect(getType(sect())).toBe("continuous");
    expect(getHeaderFooterRefs(sect())).toEqual([
      { kind: "header", type: "first", relId: "rId7" },
      { kind: "footer", type: "default", relId: "rId8" },
    ]);
    expect(hasTitlePg(sect())).toBe(true);
  });

  it("applies OOXML defaults when elements are absent", () => {
    const bare = enumerateSectPr(doc(`<w:sectPr/>`))[0].node;
    expect(getPgSz(bare)).toBeUndefined();
    expect(getPgMar(bare)).toBeUndefined();
    expect(getOrient(bare)).toBe("portrait");
    expect(getType(bare)).toBe("nextPage");
    expect(getCols(bare)).toEqual({ num: 1, equalWidth: true });
    expect(hasTitlePg(bare)).toBe(false);
    expect(getHeaderFooterRefs(bare)).toEqual([]);
  });

  it("treats w:titlePg w:val='0' as off", () => {
    expect(hasTitlePg(enumerateSectPr(doc(`<w:sectPr><w:titlePg w:val="0"/></w:sectPr>`))[0].node)).toBe(false);
  });
});

describe("sectPr setters", () => {
  it("setPgMar keeps w:cols, every other child and their order", () => {
    const ast = doc(FULL_SECTPR);
    const sect = enumerateSectPr(ast)[0].node;
    setPgMar(sect, { top: "567", left: "1134" });
    const xml = buildDocxXml(ast);
    expect(getPgMar(sect)).toMatchObject({ top: "567", left: "1134", right: "850", gutter: "0" });
    expect(getCols(sect)).toEqual({ num: 2, equalWidth: false, space: "708" });
    expect(xml).toContain(`<w:cols w:num="2" w:space="708" w:equalWidth="0"/>`);
    expect(xml.indexOf("w:pgMar")).toBeLessThan(xml.indexOf("w:cols"));
    expect(xml.indexOf("w:pgSz")).toBeLessThan(xml.indexOf("w:pgMar"));
    expect(xml).toContain("<w:docGrid");
  });

  it("inserts a missing w:pgMar at its schema position", () => {
    const ast = doc(`<w:sectPr><w:type w:val="continuous"/><w:cols w:num="1"/><w:docGrid w:linePitch="360"/></w:sectPr>`);
    setPgMar(enumerateSectPr(ast)[0].node, { top: "100", bottom: "200" });
    const xml = buildDocxXml(ast);
    expect(xml.indexOf("w:type")).toBeLessThan(xml.indexOf("w:pgMar"));
    expect(xml.indexOf("w:pgMar")).toBeLessThan(xml.indexOf("w:cols"));
    expect(xml).toContain(`<w:pgMar w:top="100" w:bottom="200"/>`);
  });

  it("setPgSz rewrites size and orientation without touching siblings", () => {
    const ast = doc(FULL_SECTPR);
    const sect = enumerateSectPr(ast)[0].node;
    setPgSz(sect, 16838, 11906, "portrait");
    expect(getPgSz(sect)).toEqual({ w: "16838", h: "11906", orient: "portrait", code: undefined });
    const xml = buildDocxXml(ast);
    expect(xml).toContain(`<w:headerReference w:type="first" r:id="rId7"/>`);
    expect(xml).toContain(`<w:titlePg/>`);
  });

  it("leaves the rest of the document untouched", () => {
    const ast = doc(`<w:p><w:r><w:t>text</w:t></w:r></w:p>${FULL_SECTPR}`);
    setPgMar(enumerateSectPr(ast)[0].node, { top: "1" });
    expect(buildDocxXml(ast)).toContain("<w:t>text</w:t>");
  });
});
