/**
 * The checker's paragraph text extraction, and the rule that depends on it.
 *
 * A tab and a line break are characters in the text, not nothing. Dropping
 * them made `text.multipleSpaces` charge for a double space that exists only
 * once the separator is thrown away — and no formatter could fix it without
 * deleting the indent of the next line.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { runQualityChecks } from "@/lib/pipeline-v6/checker";
import { rulesFromPack } from "@/lib/pipeline-v6/orchestrator";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const t = (s: string) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;

async function docx(paragraphs: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document ${W_NS}><w:body>${paragraphs}` +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

/** The rule's own count over one document. */
async function multipleSpaces(paragraphs: string): Promise<number> {
  const buf = await docx(paragraphs);
  const report = await runQualityChecks(buf, buf, undefined, "checker-text", rulesFromPack(GOST_7_32));
  return report.checks.find((c) => c.id === "text.multipleSpaces")!.count ?? 0;
}

describe("checker — разделители в тексте абзаца", () => {
  it("пробел по обе стороны переноса строки — не двойной пробел", async () => {
    const para = `<w:p>${t("Первая строка ")}<w:r><w:br/></w:r>${t(" Вторая строка")}</w:p>`;
    expect(await multipleSpaces(para)).toBe(0);
  });

  it("пробел по обе стороны табуляции — не двойной пробел", async () => {
    const para = `<w:p>${t("Слева ")}<w:r><w:tab/></w:r>${t(" справа")}</w:p>`;
    expect(await multipleSpaces(para)).toBe(0);
  });

  it("настоящий двойной пробел по-прежнему считается", async () => {
    expect(await multipleSpaces(`<w:p>${t("Слева  справа")}</w:p>`)).toBe(1);
  });

  it("настоящий двойной пробел через границу run тоже считается", async () => {
    expect(await multipleSpaces(`<w:p>${t("Слева ")}${t(" справа")}</w:p>`)).toBe(1);
  });
});
