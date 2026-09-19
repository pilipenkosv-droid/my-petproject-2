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
import { normalizeText } from "@/lib/pipeline-v7/aux";
import { children, findChild, parseDocxXml, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { buildMiniDocx, p, style, W_NS } from "./helpers/mini-docx";

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
 * Title page (3 paragraphs) → three headings → 25 body paragraphs. No TOC, no
 * section break. The sizes are the aux guards' thresholds: below them the aux
 * layer refuses to insert anything, so a fixture under them tests the guard
 * rather than the insertion.
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
      filler() +
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
    expect(texts[3]).toBe("СОДЕРЖАНИЕ");
    expect(texts[5]).toBe("ВВЕДЕНИЕ");
  });
});

describe("aux — insertion guards", () => {
  /** Body with headings and running text, but a title page of N paragraphs. */
  const withTitle = (titleParagraphs: string[]) =>
    titleParagraphs.join("") +
    H1("ВВЕДЕНИЕ") +
    p("Текст.") +
    filler(22) +
    H1("ОСНОВНАЯ ЧАСТЬ") +
    p("Разбор.") +
    H1("ЗАКЛЮЧЕНИЕ") +
    p("Итоги.") +
    SECT;

  it("inserts nothing into a fragment with no headings", async () => {
    const body = p("Титульный лист") + p("Курсовая работа") + p("Москва 2026") + filler(25) + SECT;
    const r = await run(await docx(body));
    expect(r.report.aux.headings).toBe(0);
    expect(r.report.aux.tocInserted).toBe(false);
    expect(r.report.aux.tocSkipped).toBe("too-few-headings");
    expect(r.report.aux.titleBreak).toBe(false);
    expect(r.report.aux.titleBreakSkipped).toBe("toc-guard");
    expect(r.report.gate.pass).toBe(true);
    const xml = await documentXml(r.output!);
    expect(xml).not.toContain("СОДЕРЖАНИЕ");
  });

  it("inserts nothing into a title-page-only fragment of table cells", async () => {
    const cell = (t: string) => `<w:tc>${p(t)}</w:tc>`;
    const rows = Array.from(
      { length: 6 },
      (_, i) => `<w:tr>${cell(`Поле ${i + 1}`)}${cell(`Значение ${i + 1}`)}</w:tr>`
    ).join("");
    const body =
      p("Министерство образования") +
      `<w:tbl><w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="100"/></w:tblGrid>${rows}</w:tbl>` +
      p("Москва 2026") +
      SECT;
    const r = await run(await docx(body));
    expect(r.report.aux.tocInserted).toBe(false);
    expect(r.report.aux.titleBreak).toBe(false);
    expect(r.report.gate.pass).toBe(true);
  });

  it("adds no second TOC when the student typed their own «СОДЕРЖАНИЕ»", async () => {
    const body =
      p("Министерство образования") +
      p("Курсовая работа") +
      p("Москва 2026") +
      p("СОДЕРЖАНИЕ") +
      H1("ВВЕДЕНИЕ") +
      p("Текст.") +
      filler(22) +
      H1("ОСНОВНАЯ ЧАСТЬ") +
      p("Разбор.") +
      H1("ЗАКЛЮЧЕНИЕ") +
      p("Итоги.") +
      SECT;
    const r = await run(await docx(body));
    expect(r.report.aux.tocInserted).toBe(false);
    expect(r.report.aux.tocSkipped).toBe("toc-heading-present");
    const xml = await documentXml(r.output!);
    expect(xml.match(/СОДЕРЖАНИЕ/g)).toHaveLength(1);
  });

  it("inserts the TOC when there are three headings and enough body", async () => {
    const r = await run(await docx(withTitle([p("Титул"), p("Курсовая"), p("Москва 2026")])));
    expect(r.report.aux.headings).toBeGreaterThanOrEqual(3);
    expect(r.report.aux.tocInserted).toBe(true);
    expect(r.report.aux.tocSkipped).toBeUndefined();
  });

  it("does not break a one-paragraph title page", async () => {
    const r = await run(await docx(withTitle([p("Титульный лист")])));
    expect(r.report.aux.titleBreak).toBe(false);
    expect(r.report.aux.titleBreakSkipped).toBe("title-too-short");
    expect(r.report.gate.pass).toBe(true);
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

  it("is kept in a TOC entry and dropped on a title page", () => {
    // Owner's decision, 2026-09-19: ГОСТ forbids underlining and the score the
    // student is shown is computed without roles, so a title page no longer
    // buys an exemption. The TOC keeps its own.
    const toc = parseP(UNDERLINED);
    restyleRuns(toc, "toc", GOST_7_32);
    expect(uOf(toc)).toBeDefined();

    const title = parseP(UNDERLINED);
    restyleRuns(title, "title_page", GOST_7_32);
    expect(uOf(title)).toBeUndefined();
  });

  it("drops w:u w:val=\"none\" even in a TOC entry", () => {
    const node = parseP('<w:r><w:rPr><w:u w:val="none"/></w:rPr><w:t>ВВЕДЕНИЕ</w:t></w:r>');
    restyleRuns(node, "toc", GOST_7_32);
    expect(uOf(node)).toBeUndefined();
  });

  it("keeps the width of a signature line while dropping its underline", () => {
    for (const blank of ["_________", "     "]) {
      const node = parseP(`<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>${blank}</w:t></w:r>`);
      restyleRuns(node, "title_page", GOST_7_32);
      expect(uOf(node)).toBeUndefined();
      const t = findChild(findChild(node, "w:r")!, "w:t")!;
      // The characters stay — they are what leaves room for the signature —
      // and the node now says so, or the serializer would eat the spaces.
      expect(children(t).find((c) => "#text" in c)).toBeDefined();
      expect(t[":@"]?.["@_xml:space"]).toBe("preserve");
    }
  });

  it("a title-page run with real text just loses the underline", () => {
    const node = parseP('<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Иванов И. И.</w:t></w:r>');
    restyleRuns(node, "title_page", GOST_7_32);
    expect(uOf(node)).toBeUndefined();
    const t = findChild(findChild(node, "w:r")!, "w:t")!;
    expect(t[":@"]?.["@_xml:space"]).toBeUndefined();
  });
});

describe("aux — space collapsing", () => {
  const cell = (t: string) => `<w:tc>${p(t)}</w:tc>`;
  const tbl = (rows: string) =>
    `<w:tbl><w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="100"/></w:tblGrid>${rows}</w:tbl>`;

  it("collapses inside a w:t in every role except toc and formula", async () => {
    const body =
      p("Титул   с   пробелами") +
      H1("ВВЕДЕНИЕ  ПЕРВАЯ") +
      p("Текст  с  двойными  пробелами.") +
      tbl(
        `<w:tr>${cell("Ячейка   таблицы")}${cell("данные")}</w:tr>` +
          `<w:tr>${cell("вторая")}${cell("строка")}</w:tr>`
      ) +
      SECT;
    const off = await run(await docx(body), false);
    expect(off.report.aux.spacesCollapsed).toBe(0);
    const offXml = await documentXml(off.output!);
    expect(offXml).toContain("Текст  с");
    expect(offXml).toContain("Ячейка   таблицы");

    const on = await run(await docx(body), true);
    const xml = await documentXml(on.output!);
    expect(xml).toContain("Текст с двойными пробелами.");
    expect(xml).toContain("Титул с пробелами"); // title_page is normalized too
    expect(xml).toContain("ВВЕДЕНИЕ ПЕРВАЯ"); // heading is normalized too
    expect(xml).toContain("Ячейка таблицы"); // table_cell is normalized too
    expect(on.report.aux.spacesCollapsed).toBe(7);
    expect(on.report.gate.pass).toBe(true);
  });

  it("never touches a field instruction", () => {
    const node = findChild(
      parseDocxXml(
        `<w:root ${W_NS}><w:p><w:r><w:instrText xml:space="preserve"> PAGE   \\* MERGEFORMAT </w:instrText></w:r></w:p></w:root>`
      ).find((n) => "w:root" in n)!,
      "w:p"
    )!;
    const cp = { node, path: "p", part: "word/document.xml", role: "body" as const, confidence: 1, source: "style" as const };
    const collapsed = normalizeText({
      byNode: new WeakMap(),
      list: [cp],
      histogram: {} as never,
      warnings: [],
      suspect: false,
    });
    expect(collapsed.spacesCollapsed).toBe(0);
  });

  it("passes the gate with the flag on", async () => {
    const r = await run(await docx(BODY), true);
    expect(r.report.gate.violations).toEqual([]);
    expect(r.report.aux.spacesCollapsed).toBe(1);
  });
});
