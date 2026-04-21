import * as fs from "fs";
import { extractTitlePageXml, prependTitleToDocx } from "../../src/lib/pipeline-v6/assembler/titlepage";
import JSZip from "jszip";

async function main() {
  const src = fs.readFileSync("data/golden/raw/1fQQWL9EHe5XDnM4jjniD.docx");
  const titleXml = await extractTitlePageXml(src);
  console.log("title XML length:", titleXml?.length);
  if (!titleXml) { console.error("no title extracted"); process.exit(1); }
  const zip = await JSZip.loadAsync(src);
  const clone = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  const out = await prependTitleToDocx(clone, titleXml);
  fs.writeFileSync("/tmp/smoke-out.docx", out);
  const outZip = await JSZip.loadAsync(out);
  const xml = await outZip.file("word/document.xml")!.async("string");
  console.log("xmlns:w14 present:", /xmlns:w14=/.test(xml));
  console.log("xmlns:w15 present:", /xmlns:w15=/.test(xml));
  console.log("orphan w14 attr:", /\sw14:[a-zA-Z]+=/.test(xml));
}
main().catch((e) => { console.error(e); process.exit(1); });
