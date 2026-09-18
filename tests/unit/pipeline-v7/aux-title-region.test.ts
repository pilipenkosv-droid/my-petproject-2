/**
 * Finding the title page when the classifier did not, and the page break the
 * inserted section break makes redundant.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { runPipelineV7 } from "@/lib/pipeline-v7/orchestrator";
import { children, findChild, parseDocxXml, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { buildMiniDocx, p, style } from "./helpers/mini-docx";

const SECT = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:left="1701"/></w:sectPr>`;
const STYLES = style("Heading1", "heading 1") + style("Normal", "Normal");
const SETTINGS = `<w:defaultTabStop w:val="708"/><w:compat/><w:rsids><w:rsidRoot w:val="00A1"/></w:rsids>`;
const H1 = (t: string) => p(t, `<w:pStyle w:val="Heading1"/>`);

/**
 * Plain sentences. Without them the handful of headings in these fixtures is a
 * large enough share of the document for the classifier to call it suspect,
 * and a suspect classification is refused rather than restyled.
 */
const filler = (n = 12) =>
  Array.from({ length: n }, (_, i) => p(`Обычное предложение номер ${i + 1} в основном тексте.`)).join("");

/**
 * Title page (3 paragraphs) → three headings → 25 body paragraphs: the sizes
 * the aux guards ask for before they will insert anything.
 */
const BODY =
  p("Министерство образования") +
  p("Курсовая работа") +
  p("Москва 2026") +
  H1("ВВЕДЕНИЕ") +
  p("Некоторый  текст работы с двойным пробелом.") +
  filler(22) +
  H1("ОСНОВНАЯ ЧАСТЬ") +
  p("Разбор темы.") +
  H1("ЗАКЛЮЧЕНИЕ") +
  p("Итоги.") +
  SECT;

function docx(body: string, extra: { settings?: string } = {}) {
  return buildMiniDocx({ body, styles: STYLES, settings: extra.settings ?? SETTINGS });
}

async function run(input: Buffer, textNormalization = false) {
  return runPipelineV7(input, {
    pack: GOST_7_32,
    documentId: "aux-test",
    returnOnGateFail: true,
    textNormalization,
  });
}

async function partOf(buf: Buffer, name: string): Promise<OrderedXmlNode[]> {
  const xml = await (await JSZip.loadAsync(buf)).file(name)!.async("string");
  return parseDocxXml(xml);
}

async function documentXml(buf: Buffer): Promise<string> {
  return (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
}

describe("aux — locating the title page (D-1)", () => {
  /** A title page drawn as a single table, ended by a hard page break. */
  const TABLE_TITLE =
    '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>' +
    '<w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid>' +
    "<w:tr><w:tc><w:p><w:r><w:t>Министерство образования</w:t></w:r></w:p></w:tc></w:tr></w:tbl>";

  it("inserts after a table title page followed by a page break", async () => {
    const body =
      TABLE_TITLE +
      p("", '<w:pageBreakBefore/>') +
      H1("ВВЕДЕНИЕ") +
      p("Текст.") +
      filler(22) +
      H1("ОСНОВНАЯ ЧАСТЬ") +
      p("Разбор.") +
      H1("ЗАКЛЮЧЕНИЕ") +
      p("Итоги.") +
      SECT;
    const r = await run(await docx(body));
    expect(r.report.aux.tocSkipped).toBeUndefined();
    expect(r.report.aux.tocInserted).toBe(true);
    expect(r.report.gate.pass).toBe(true);

    const nodes = await partOf(r.output!, "word/document.xml");
    const blocks = children(findChild(nodes.find((n) => "w:document" in n)!, "w:body")!);
    const tableAt = blocks.findIndex((n) => "w:tbl" in n);
    const tocAt = blocks.findIndex((n) => JSON.stringify(n).includes("СОДЕРЖАНИЕ"));
    expect(tocAt).toBeGreaterThan(tableAt);
  });

  it("inserts nothing when no title region can be found", async () => {
    const body =
      H1("ВВЕДЕНИЕ") +
      p("Текст.") +
      filler(22) +
      H1("ОСНОВНАЯ ЧАСТЬ") +
      p("Разбор.") +
      H1("ЗАКЛЮЧЕНИЕ") +
      p("Итоги.") +
      SECT;
    const r = await run(await docx(body));
    expect(r.report.aux.tocSkipped).toBe("no-title-page");
    expect(r.report.aux.tocInserted).toBe(false);
    expect(r.report.aux.titleBreak).toBe(false);
    expect(await documentXml(r.output!)).not.toContain("СОДЕРЖАНИЕ");
  });

  it("adds no TOC above a bare СОДЕРЖАНИЕ heading the student typed (D-6)", async () => {
    const body =
      p("Титульный лист") +
      p("Курсовая работа") +
      p("Москва 2026") +
      H1("СОДЕРЖАНИЕ") +
      H1("ВВЕДЕНИЕ") +
      p("Текст.") +
      filler(22) +
      H1("ЗАКЛЮЧЕНИЕ") +
      p("Итоги.") +
      SECT;
    const r = await run(await docx(body));
    expect(r.report.aux.tocInserted).toBe(false);
    expect(r.report.aux.tocSkipped).toBe("toc-heading-present");
    expect(r.report.gate.pass).toBe(true);
    expect((await documentXml(r.output!)).match(/СОДЕРЖАНИЕ/g)).toHaveLength(1);
  });
});

describe("aux — the page break the section break makes redundant (C-4)", () => {
  it("takes back the restyler's own break on the heading after the title page", async () => {
    const r = await run(await docx(BODY));
    expect(r.report.aux.titleBreak).toBe(true);
    expect(r.report.aux.redundantBreakRemoved).toBe(true);

    const nodes = await partOf(r.output!, "word/document.xml");
    const blocks = children(findChild(nodes.find((n) => "w:document" in n)!, "w:body")!);
    const breakAt = blocks.findIndex((n) => JSON.stringify(n).includes("w:sectPr"));
    const next = blocks.slice(breakAt + 1).find((n) => "w:p" in n)!;
    expect(JSON.stringify(next)).not.toContain("pageBreakBefore");
  });

  it("keeps a page break the student had written there", async () => {
    const body =
      p("Министерство образования") +
      p("Курсовая работа") +
      p("Москва 2026") +
      p("ПРОЛОГ", '<w:pageBreakBefore/>') +
      p("Текст.") +
      filler(22) +
      SECT;
    const r = await run(await docx(body));
    const xml = await documentXml(r.output!);
    expect(xml).toContain("pageBreakBefore");
    expect(r.report.gate.pass).toBe(true);
  });
});
