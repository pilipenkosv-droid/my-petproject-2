// Integration test for pandoc assembler wrapper.
// Requires `pandoc` on PATH. Skipped automatically if missing.

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as path from "path";
import JSZip from "jszip";
import { assembleWithPandoc } from "../../../src/lib/pipeline-v6/assembler/pandoc";

const hasPandoc = (() => {
  try {
    execSync("pandoc --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const REFERENCE = path.join(
  process.cwd(),
  "scripts/pipeline-v6/spike-pandoc/reference-gost.docx",
);

describe.skipIf(!hasPandoc)("assembleWithPandoc", () => {
  it("produces a .docx with headings and TOC field code", async () => {
    const markdown = [
      "# Введение",
      "",
      "Первая глава. Формула: $\\sum_{i=1}^{n} x_i$.",
      "",
      "# Глава 1",
      "",
      "## Раздел 1.1",
      "",
      "Текст раздела.",
      "",
      "# Заключение",
      "",
      "Итог.",
    ].join("\n");

    const result = await assembleWithPandoc({
      markdown,
      referenceDoc: REFERENCE,
      metadata: { title: "Тестовый документ", lang: "ru" },
      toc: true,
      tocDepth: 2,
    });

    expect(result.buffer.length).toBeGreaterThan(5000);
    expect(result.elapsedMs).toBeLessThan(5000);

    const zip = await JSZip.loadAsync(result.buffer);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toMatch(/TOC \\o/);
    expect((xml.match(/<w:pStyle w:val="Heading1"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((xml.match(/<m:oMath(Para)?\b/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("throws PandocError on invalid reference-doc", async () => {
    await expect(
      assembleWithPandoc({
        markdown: "# test",
        referenceDoc: "/nonexistent/ref.docx",
      }),
    ).rejects.toThrow(/reference-doc missing/);
  });
});
