// Verifies that extractTablesWithAnchors returns tables with preceding-paragraph anchors
// and that orchestrator's anchor-based injection finds them in markdown.

import * as fs from "fs";
import { extractDocument, extractTablesWithAnchors } from "../../src/lib/pipeline-v6/extractor/mammoth-extractor";

async function main() {
  const buf = fs.readFileSync(process.argv[2] ?? "data/golden/raw/1fQQWL9EHe5XDnM4jjniD.docx");
  const imageDir = fs.mkdtempSync("/tmp/v6-smoke-");
  const extracted = await extractDocument(buf, { imageDir });

  const zip = (await import("jszip")).default;
  const jszip = await zip.loadAsync(buf);
  const xml = (await jszip.file("word/document.xml")!.async("string"));

  const anchors = extractTablesWithAnchors(xml);
  const normalize = (s: string) => s.replace(/[\t\u00A0]+/g, " ").replace(/[*_`]+/g, "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();
  console.log(`tables found: ${anchors.length}`);
  let matched = 0;
  for (const a of anchors) {
    const key = normalize(a.precedingText).substring(0, 50);
    const found = extracted.markdown.split("\n").find((l) => {
      const n = normalize(l);
      return n.substring(0, 50) === key || (key.length >= 8 && n.includes(key));
    });
    if (found) matched++;
    console.log(`  ${found ? "✓" : "✗"} key="${key.substring(0, 40)}" rows=${a.table.rows.length}`);
  }
  console.log(`matched ${matched}/${anchors.length}`);
}

main().catch(console.error);
