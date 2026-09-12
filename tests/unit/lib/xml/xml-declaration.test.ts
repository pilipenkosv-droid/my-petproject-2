/**
 * Регрессия: `Cannot read properties of undefined (reading '#text')`
 *
 * Падало на 4 проде-документах (авг–сен 2026) в applyListFormatting,
 * когда в исходном docx НЕТ word/numbering.xml и его приходится создавать
 * с нуля вместе с XML-декларацией.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  parseDocxXml,
  buildDocxXml,
  createNode,
  createTextNode,
  children,
  findChild,
} from "@/lib/xml/docx-xml";
import { createXmlDeclNode } from "@/lib/xml/xml-declaration";
import { applyListFormatting } from "@/lib/formatters/list-formatter";
import { DocxParagraph } from "@/lib/pipeline/document-analyzer";
import { DEFAULT_GOST_RULES } from "@/types/formatting-rules";

describe("createXmlDeclNode", () => {
  it("строит декларацию, которую XMLBuilder может сериализовать", () => {
    expect(buildDocxXml([createXmlDeclNode()])).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    );
  });

  it("совпадает по форме с тем, что отдаёт парсер", () => {
    const parsed = parseDocxXml(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="x"/>'
    );
    expect(parsed[0]).toEqual(createXmlDeclNode());
  });

  it("узел с пустым списком потомков (старая форма) ронял build", () => {
    expect(() =>
      buildDocxXml([{ "?xml": [], ":@": { "@_version": "1.0" } }])
    ).toThrow(/#text/);
  });
});

/** Минимальный docx со списком и БЕЗ word/numbering.xml */
async function createDocxWithListNoNumbering(items: string[]): Promise<{
  buffer: Buffer;
  enriched: DocxParagraph[];
}> {
  const bodyChildren = items.map((text) =>
    createNode("w:p", undefined, [
      createNode("w:r", undefined, [
        createNode("w:t", { "xml:space": "preserve" }, [createTextNode(text)]),
      ]),
    ])
  );
  bodyChildren.push(createNode("w:sectPr"));

  const docXml = buildDocxXml([
    createNode(
      "w:document",
      { "xmlns:w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main" },
      [createNode("w:body", undefined, bodyChildren)]
    ),
  ]);

  const zip = new JSZip();
  zip.file("word/document.xml", docXml);
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  );

  const buffer = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
  const enriched: DocxParagraph[] = items.map((text, i) => ({
    index: i,
    text,
    blockType: "list_item" as DocxParagraph["blockType"],
    isEmpty: false,
    style: undefined,
    fontSize: undefined,
    fontFamily: undefined,
    alignment: undefined,
    isBold: false,
    isItalic: false,
    isUnderline: false,
    lineSpacing: undefined,
    firstLineIndent: undefined,
    blockMetadata: undefined,
  }));
  return { buffer, enriched };
}

describe("applyListFormatting без word/numbering.xml", () => {
  it("не падает и создаёт валидный numbering.xml", async () => {
    const { buffer, enriched } = await createDocxWithListNoNumbering([
      "– первый пункт",
      "– второй пункт",
      "– третий пункт",
    ]);

    const result = await applyListFormatting(buffer, enriched, DEFAULT_GOST_RULES);

    const zip = await JSZip.loadAsync(result);
    const numberingXml = await zip.file("word/numbering.xml")?.async("string");
    expect(numberingXml).toBeDefined();
    expect(numberingXml!.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);

    // Конструкция на месте: abstractNum + num переживают round-trip
    const parsed = parseDocxXml(numberingXml!);
    const numbering = parsed.find((n) => "w:numbering" in n);
    expect(numbering).toBeDefined();
    const kids = children(numbering!);
    expect(kids.some((c) => "w:abstractNum" in c)).toBe(true);
    expect(kids.some((c) => "w:num" in c)).toBe(true);
    expect(findChild(numbering!, "w:num")![":@"]).toBeDefined();

    // И ссылка на numbering.xml прописана
    const rels = await zip.file("word/_rels/document.xml.rels")?.async("string");
    expect(rels).toContain("numbering.xml");
  });
});
