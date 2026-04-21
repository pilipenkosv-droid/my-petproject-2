// Pandoc spike — prove or disprove Pandoc is viable as pipeline-v6 assembler.
// Runs: pandoc --reference-doc=reference-gost.docx sample-input.md -o out.docx --toc --toc-depth=2
// Inspects out.docx for TOC field code, OMML formulas, table count, heading styles.

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";

const HERE = __dirname;
const INPUT = path.join(HERE, "sample-input.md");
const REFERENCE = path.join(HERE, "reference-gost.docx");
const OUTPUT = path.join(HERE, "out.docx");

async function main(): Promise<void> {
  if (!fs.existsSync(REFERENCE)) {
    console.error(`Missing reference doc at ${REFERENCE}`);
    console.error("Run: pandoc -o reference-gost.docx --print-default-data-file reference.docx");
    process.exit(1);
  }

  const t0 = Date.now();
  execSync(
    `pandoc --reference-doc="${REFERENCE}" "${INPUT}" -o "${OUTPUT}" --toc --toc-depth=2`,
    { stdio: "inherit", cwd: HERE },
  );
  const elapsedMs = Date.now() - t0;

  const buf = fs.readFileSync(OUTPUT);
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";

  const tocFieldCode = /TOC \\o/.test(xml);
  const ommlCount = (xml.match(/<m:oMath(Para)?\b/g) ?? []).length;
  const tableCount = (xml.match(/<w:tbl[ >]/g) ?? []).length;
  const h1Count = (xml.match(/<w:pStyle w:val="Heading1"/g) ?? []).length;
  const h2Count = (xml.match(/<w:pStyle w:val="Heading2"/g) ?? []).length;
  const fileSize = buf.byteLength;

  const summary = {
    elapsed_ms: elapsedMs,
    output_bytes: fileSize,
    toc_field_code: tocFieldCode,
    omml_formulas: ommlCount,
    tables: tableCount,
    heading_1: h1Count,
    heading_2: h2Count,
  };

  console.log("\n=== Pandoc spike results ===");
  console.log(JSON.stringify(summary, null, 2));

  const expectations = [
    ["TOC field code present", tocFieldCode],
    ["OMML formulas (>=2)", ommlCount >= 2],
    ["Simple table rendered (>=1)", tableCount >= 1],
    ["Heading 1 styles (>=3)", h1Count >= 3],
    ["Heading 2 styles (>=1)", h2Count >= 1],
  ] as const;

  console.log("\nExpectations:");
  for (const [name, ok] of expectations) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
