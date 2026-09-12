// Регрессия: originalTableCount в orchestrator считался по mammoth-выходу, где
// таблицы уже вырезаны (stripTablesForMammoth) — в статистику всегда уходил 0.
// Теперь счёт идёт по исходному word/document.xml. Тест фиксирует и границы
// метода: regex по <w:tbl> не различает вложенность и не обходит w:sdt.

import { describe, it, expect } from "vitest";
import JSZip from "jszip";

import { countTablesInDocumentXml } from "@/lib/pipeline-v6/table-count";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

function table(inner = ""): string {
  return `<w:tbl><w:tblPr/><w:tr><w:tc><w:p><w:r><w:t>ячейка</w:t></w:r></w:p>${inner}</w:tc></w:tr></w:tbl>`;
}

function documentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;
}

/** Собирает минимальный .docx и возвращает его word/document.xml (или "" — если части нет). */
async function docxDocumentXml(body: string | null): Promise<string> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  if (body !== null) zip.file("word/document.xml", documentXml(body));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const reopened = await JSZip.loadAsync(buffer);
  return (await reopened.file("word/document.xml")?.async("string")) ?? "";
}

describe("countTablesInDocumentXml", () => {
  it("документ без word/document.xml → 0", async () => {
    expect(countTablesInDocumentXml(await docxDocumentXml(null))).toBe(0);
  });

  it("документ без таблиц → 0", async () => {
    const xml = await docxDocumentXml("<w:p><w:r><w:t>Введение</w:t></w:r></w:p>");
    expect(countTablesInDocumentXml(xml)).toBe(0);
  });

  it("две таблицы подряд → 2", async () => {
    const xml = await docxDocumentXml(table() + "<w:p/>" + table());
    expect(countTablesInDocumentXml(xml)).toBe(2);
  });

  it("таблица внутри <w:sdt> считается", async () => {
    const xml = await docxDocumentXml(`<w:sdt><w:sdtContent>${table()}</w:sdtContent></w:sdt>`);
    expect(countTablesInDocumentXml(xml)).toBe(1);
  });

  it("вложенная таблица считается дважды — текущее поведение метода", async () => {
    const xml = await docxDocumentXml(table(table()));
    expect(countTablesInDocumentXml(xml)).toBe(2);
  });
});
