/**
 * Unit-тесты для document-cleanup-formatter
 *
 * Проверяет нумерацию заголовков и прочие cleanup-операции
 * без зависимости от AI block markup.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  parseDocxXml,
  buildDocxXml,
  getBody,
  getParagraphsWithPositions,
  createNode,
  createTextNode,
  children,
  findChildren,
  getText,
  getRuns,
} from "@/lib/xml/docx-xml";
import { applyDocumentCleanup } from "@/lib/formatters/document-cleanup-formatter";
import { DocxParagraph } from "@/lib/pipeline/document-analyzer";
import { DEFAULT_GOST_RULES } from "@/types/formatting-rules";

/**
 * Создаёт минимальный docx-буфер с заданными параграфами
 */
async function createTestDocx(paragraphs: { text: string; blockType: string }[]): Promise<{
  buffer: Buffer;
  enriched: DocxParagraph[];
}> {
  const bodyChildren = paragraphs.map((p) =>
    createNode("w:p", undefined, [
      createNode("w:r", undefined, [
        createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(p.text),
        ]),
      ]),
    ])
  );

  // Добавляем sectPr в конец (обязательно для валидного docx)
  bodyChildren.push(createNode("w:sectPr"));

  const docXml = buildDocxXml([
    createNode("w:document", { "xmlns:w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main" }, [
      createNode("w:body", undefined, bodyChildren),
    ]),
  ]);

  const zip = new JSZip();
  zip.file("word/document.xml", docXml);
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');

  const buffer = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

  const enriched: DocxParagraph[] = paragraphs.map((p, i) => ({
    index: i,
    text: p.text,
    blockType: p.blockType as DocxParagraph["blockType"],
    isEmpty: p.text.trim().length === 0,
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

/**
 * Извлекает тексты параграфов из docx-буфера
 */
async function extractParagraphTexts(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return [];

  const parsed = parseDocxXml(xml);
  const body = getBody(parsed);
  if (!body) return [];

  const paragraphs = getParagraphsWithPositions(body);
  return paragraphs.map(({ node }) => {
    const runs = getRuns(node);
    let text = "";
    for (const run of runs) {
      const tNodes = findChildren(run, "w:t");
      for (const t of tNodes) {
        text += getText(t);
      }
    }
    return text;
  });
}

describe("applyDocumentCleanup", () => {
  describe("heading numbering", () => {
    it("numbers heading_1 as 1, 2, 3", async () => {
      const { buffer, enriched } = await createTestDocx([
        { text: "ВВЕДЕНИЕ", blockType: "heading_1" },
        { text: "Теоретические основы", blockType: "heading_1" },
        { text: "Практическая часть", blockType: "heading_1" },
        { text: "ЗАКЛЮЧЕНИЕ", blockType: "heading_1" },
      ]);

      const result = await applyDocumentCleanup(buffer, enriched, DEFAULT_GOST_RULES);
      const texts = await extractParagraphTexts(result);

      // ВВЕДЕНИЕ и ЗАКЛЮЧЕНИЕ — структурные, не нумеруются
      expect(texts[0]).toBe("ВВЕДЕНИЕ");
      expect(texts[3]).toBe("ЗАКЛЮЧЕНИЕ");

      // Содержательные заголовки нумеруются
      expect(texts[1]).toBe("1 Теоретические основы");
      expect(texts[2]).toBe("2 Практическая часть");
    });

    it("numbers heading_2 as 1.1, 1.2", async () => {
      const { buffer, enriched } = await createTestDocx([
        { text: "Теория", blockType: "heading_1" },
        { text: "Первый раздел", blockType: "heading_2" },
        { text: "Второй раздел", blockType: "heading_2" },
        { text: "Практика", blockType: "heading_1" },
        { text: "Эксперимент", blockType: "heading_2" },
      ]);

      const result = await applyDocumentCleanup(buffer, enriched, DEFAULT_GOST_RULES);
      const texts = await extractParagraphTexts(result);

      expect(texts[0]).toBe("1 Теория");
      expect(texts[1]).toBe("1.1 Первый раздел");
      expect(texts[2]).toBe("1.2 Второй раздел");
      expect(texts[3]).toBe("2 Практика");
      expect(texts[4]).toBe("2.1 Эксперимент");
    });

    it("handles existing numbering (replaces)", async () => {
      const { buffer, enriched } = await createTestDocx([
        { text: "1.Теория", blockType: "heading_1" },
        { text: "1.1 Первый раздел", blockType: "heading_2" },
        { text: "2 Практика", blockType: "heading_1" },
      ]);

      const result = await applyDocumentCleanup(buffer, enriched, DEFAULT_GOST_RULES);
      const texts = await extractParagraphTexts(result);

      expect(texts[0]).toBe("1 Теория");
      expect(texts[1]).toBe("1.1 Первый раздел");
      expect(texts[2]).toBe("2 Практика");
    });

    it("numbers heading_3 as 1.1.1", async () => {
      const { buffer, enriched } = await createTestDocx([
        { text: "Глава", blockType: "heading_1" },
        { text: "Раздел", blockType: "heading_2" },
        { text: "Подраздел один", blockType: "heading_3" },
        { text: "Подраздел два", blockType: "heading_3" },
      ]);

      const result = await applyDocumentCleanup(buffer, enriched, DEFAULT_GOST_RULES);
      const texts = await extractParagraphTexts(result);

      expect(texts[0]).toBe("1 Глава");
      expect(texts[1]).toBe("1.1 Раздел");
      expect(texts[2]).toBe("1.1.1 Подраздел один");
      expect(texts[3]).toBe("1.1.2 Подраздел два");
    });
  });

  describe("empty paragraph cleanup", () => {
    it("collapses 4+ empty paragraphs to 2", async () => {
      const { buffer, enriched } = await createTestDocx([
        { text: "Текст", blockType: "body_text" },
        { text: "", blockType: "empty" },
        { text: "", blockType: "empty" },
        { text: "", blockType: "empty" },
        { text: "", blockType: "empty" },
        { text: "", blockType: "empty" },
        { text: "Ещё текст", blockType: "body_text" },
      ]);

      const result = await applyDocumentCleanup(buffer, enriched, DEFAULT_GOST_RULES);
      const texts = await extractParagraphTexts(result);

      // 5 пустых → max 2
      const emptyCount = texts.filter((t) => t.trim() === "").length;
      expect(emptyCount).toBeLessThanOrEqual(2);
      expect(texts[0]).toBe("Текст");
      expect(texts[texts.length - 1]).toBe("Ещё текст");
    });
  });
});
