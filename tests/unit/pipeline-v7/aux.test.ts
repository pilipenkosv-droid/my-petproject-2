/**
 * The aux layer: TOC insertion, the section break after the title page,
 * repeating table headers, underline removal and space collapsing.
 *
 * The load-bearing assertion in every insertion test is the fidelity gate:
 * whatever is added has to be invisible to it, either because it sits inside an
 * `_dpx_aux_*` range (A1) or because a named allowance covers it (A7).
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { runPipelineV7 } from "@/lib/pipeline-v7/orchestrator";
import { restyleRuns, setHeaderRow } from "@/lib/pipeline-v7/restyle";
import { normalizeSpaces } from "@/lib/pipeline-v7/aux";
import { children, findChild, parseDocxXml, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { buildMiniDocx, p, style, W_NS } from "./helpers/mini-docx";

const SECT = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:left="1701"/></w:sectPr>`;
const STYLES = style("Heading1", "heading 1") + style("Normal", "Normal");
const SETTINGS = `<w:defaultTabStop w:val="708"/><w:compat/><w:rsids><w:rsidRoot w:val="00A1"/></w:rsids>`;
const H1 = (t: string) => p(t, `<w:pStyle w:val="Heading1"/>`);

/** Title page (2 paragraphs) → heading → body. No TOC, no section break. */
const BODY =
  p("Министерство образования") +
  p("Курсовая работа") +
  H1("ВВЕДЕНИЕ") +
  p("Некоторый  текст работы с двойным пробелом.") +
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

describe("aux — TOC insertion", () => {
  it("inserts the heading and the field once, and the gate does not notice", async () => {
    const r = await run(await docx(BODY));
    expect(r.report.gate.violations).toEqual([]);
    expect(r.report.gate.pass).toBe(true);
    expect(r.report.aux.tocInserted).toBe(true);

    const xml = await documentXml(r.output!);
    expect(xml).toContain("СОДЕРЖАНИЕ");
    expect(xml).toContain('TOC \\o "1-3" \\h \\z \\u');
    expect(xml).toContain('w:fldCharType="begin" w:dirty="true"');
    expect(xml.match(/_dpx_aux_toc_/g)).toHaveLength(2);
    expect(xml.match(/w:instrText/g)?.length).toBe(2); // open + close tag of one element
  });

  it("is idempotent: a second pass finds the TOC it made and adds nothing", async () => {
    const first = await run(await docx(BODY));
    const second = await run(first.output!);
    expect(second.report.aux.tocInserted).toBe(false);
    expect(second.report.aux.tocExisting).toBe(true);
    const xml = await documentXml(second.output!);
    expect(xml.match(/СОДЕРЖАНИЕ/g)).toHaveLength(1);
  });

  it("leaves a TOC the student already wrote in place", async () => {
    const withToc =
      p("Титульный лист") +
      p("СОДЕРЖАНИЕ") +
      p("Введение\t3", `<w:pStyle w:val="TOC1"/>`) +
      H1("ВВЕДЕНИЕ") +
      p("Текст.") +
      SECT;
    const r = await run(await docx(withToc));
    expect(r.report.aux.tocExisting).toBe(true);
    expect(r.report.aux.tocInserted).toBe(false);
    expect(r.report.gate.pass).toBe(true);
  });

  it("inserts the TOC right after the title page, before the first heading", async () => {
    const r = await run(await docx(BODY));
    const nodes = await partOf(r.output!, "word/document.xml");
    const body = findChild(nodes.find((n) => "w:document" in n)!, "w:body")!;
    const texts = children(body)
      .filter((n) => "w:p" in n)
      .map((n) => JSON.stringify(n).match(/"#text":"([^"]*)"/)?.[1] ?? "");
    expect(texts[2]).toBe("СОДЕРЖАНИЕ");
    expect(texts[4]).toBe("ВВЕДЕНИЕ");
  });
});

describe("aux — settings.xml", () => {
  it("adds w:updateFields after the unknown head and before w:compat", async () => {
    const r = await run(await docx(BODY));
    expect(r.report.aux.updateFields).toBe(true);
    const nodes = await partOf(r.output!, "word/settings.xml");
    const root = nodes.find((n) => "w:settings" in n)!;
    const tags = children(root).map((c) => tagName(c));
    expect(tags).toEqual(["w:defaultTabStop", "w:updateFields", "w:compat", "w:rsids"]);
    const node = findChild(root, "w:updateFields")!;
    expect(node[":@"]?.["@_w:val"]).toBe("true");
  });

  it("reports updateFields=false when the package has no settings part", async () => {
    const buf = await buildMiniDocx({ body: BODY, styles: STYLES });
    const r = await run(buf);
    expect(r.report.aux.tocInserted).toBe(true);
    expect(r.report.aux.updateFields).toBe(false);
    expect(r.report.gate.pass).toBe(true);
  });
});

describe("aux — section break after the title page", () => {
  it("satisfies the checker rule and is permitted as A7", async () => {
    const r = await run(await docx(BODY));
    expect(r.report.aux.titleBreak).toBe(true);
    expect(r.report.checker.failed).not.toContain("structure.sectionBreakAfterTitle");
    expect(r.report.gate.pass).toBe(true);
    expect(r.report.gate.allowed.map((a) => a.rule)).toContain("A7");
  });

  it("copies the governing section, differing only in w:type", async () => {
    const r = await run(await docx(BODY));
    const xml = await documentXml(r.output!);
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(2);
    expect(xml).toContain('<w:type w:val="nextPage"/>');
    expect(xml.match(/w:pgSz w:w="11906"/g)).toHaveLength(2);
  });

  it("adds nothing when a section break is already there", async () => {
    const first = await run(await docx(BODY));
    const second = await run(first.output!);
    expect(second.report.aux.titleBreak).toBe(false);
    const xml = await documentXml(second.output!);
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(2);
  });

  it("does nothing for a document with no title page", async () => {
    const body = H1("ВВЕДЕНИЕ") + p("Текст.") + SECT;
    const r = await run(await docx(body));
    expect(r.report.aux.titleBreak).toBe(false);
    expect(r.report.gate.pass).toBe(true);
  });
});

describe("aux — repeating table headers", () => {
  const cell = (t: string, tcPr = "") => `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ""}${p(t)}</w:tc>`;
  const tbl = (rows: string) =>
    `<w:tbl><w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="100"/></w:tblGrid>${rows}</w:tbl>`;
  const parse = (xml: string): OrderedXmlNode =>
    findChild(parseDocxXml(`<w:root ${W_NS}>${xml}</w:root>`).find((n) => "w:root" in n)!, "w:tbl")!;

  it("sets w:tblHeader on the first row of a multi-row table", () => {
    const t = parse(tbl(`<w:tr>${cell("шапка")}</w:tr><w:tr>${cell("данные")}</w:tr>`));
    expect(setHeaderRow(t)).toBe(true);
    const trPr = findChild(findChild(t, "w:tr")!, "w:trPr")!;
    expect(findChild(trPr, "w:tblHeader")).toBeDefined();
    expect(setHeaderRow(t)).toBe(false); // idempotent
  });

  it("skips a single-row table — the checker does too", () => {
    expect(setHeaderRow(parse(tbl(`<w:tr>${cell("одна")}</w:tr>`)))).toBe(false);
  });

  it("skips a first row that continues a vertical merge", () => {
    const t = parse(
      tbl(`<w:tr>${cell("продолжение", "<w:vMerge/>")}</w:tr><w:tr>${cell("данные")}</w:tr>`)
    );
    expect(setHeaderRow(t)).toBe(false);
  });

  it("accepts a first row that starts a vertical merge", () => {
    const t = parse(
      tbl(`<w:tr>${cell("шапка", '<w:vMerge w:val="restart"/>')}</w:tr><w:tr>${cell("данные")}</w:tr>`)
    );
    expect(setHeaderRow(t)).toBe(true);
  });

  it("keeps w:trPr after w:tblPrEx", () => {
    const t = parse(
      tbl(`<w:tr><w:tblPrEx><w:tblW w:w="0" w:type="auto"/></w:tblPrEx>${cell("шапка")}</w:tr>` +
        `<w:tr>${cell("данные")}</w:tr>`)
    );
    setHeaderRow(t);
    const tags = children(findChild(t, "w:tr")!).map((c) => tagName(c));
    expect(tags.slice(0, 2)).toEqual(["w:tblPrEx", "w:trPr"]);
  });
});

describe("aux — underline", () => {
  const parseP = (inner: string): OrderedXmlNode =>
    findChild(parseDocxXml(`<w:root ${W_NS}><w:p>${inner}</w:p></w:root>`).find((n) => "w:root" in n)!, "w:p")!;
  const UNDERLINED = '<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>текст</w:t></w:r>';
  const uOf = (node: OrderedXmlNode) =>
    findChild(findChild(findChild(node, "w:r")!, "w:rPr")!, "w:u");

  it("is removed from body text", () => {
    const node = parseP(UNDERLINED);
    const counters = { underlineRemoved: 0 };
    restyleRuns(node, "body", GOST_7_32, { counters });
    expect(uOf(node)).toBeUndefined();
    expect(counters.underlineRemoved).toBe(1);
  });

  it("is kept on a title page and in a TOC entry", () => {
    for (const role of ["title_page", "toc"] as const) {
      const node = parseP(UNDERLINED);
      restyleRuns(node, role, GOST_7_32);
      expect(uOf(node)).toBeDefined();
    }
  });
});

describe("aux — space collapsing", () => {
  it("collapses only inside a w:t, and only in body-like roles", async () => {
    const body =
      p("Титул   с   пробелами") +
      H1("ВВЕДЕНИЕ") +
      p("Текст  с  двойными  пробелами.") +
      SECT;
    const off = await run(await docx(body), false);
    expect(off.report.aux.spacesCollapsed).toBe(0);
    expect(await documentXml(off.output!)).toContain("Текст  с");

    const on = await run(await docx(body), true);
    expect(on.report.aux.spacesCollapsed).toBe(3);
    const xml = await documentXml(on.output!);
    expect(xml).toContain("Текст с двойными пробелами.");
    expect(xml).toContain("Титул   с   пробелами"); // title_page is left alone
  });

  it("never touches a field instruction", () => {
    const node = findChild(
      parseDocxXml(
        `<w:root ${W_NS}><w:p><w:r><w:instrText xml:space="preserve"> PAGE   \\* MERGEFORMAT </w:instrText></w:r></w:p></w:root>`
      ).find((n) => "w:root" in n)!,
      "w:p"
    )!;
    const cp = { node, path: "p", part: "word/document.xml", role: "body" as const, confidence: 1, source: "style" as const };
    const collapsed = normalizeSpaces({
      byNode: new WeakMap(),
      list: [cp],
      histogram: {} as never,
      warnings: [],
      suspect: false,
    });
    expect(collapsed).toBe(0);
  });

  it("passes the gate with the flag on", async () => {
    const r = await run(await docx(BODY), true);
    expect(r.report.gate.violations).toEqual([]);
    expect(r.report.aux.spacesCollapsed).toBe(1);
  });
});
