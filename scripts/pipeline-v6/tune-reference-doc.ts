// Patches scripts/pipeline-v6/spike-pandoc/reference-gost.docx with ГОСТ 7.32 styles.
// ГОСТ: поля 20/10/20/30 мм (top/right/bottom/left), Times New Roman 14 pt,
// интерлиньяж 1.5 (line=360 in twentieths), абзацный отступ 12.5 мм (708 twips),
// заголовки — bold, H1 по центру с разрывом страницы.
//
// Run: npx tsx scripts/pipeline-v6/tune-reference-doc.ts

import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";

const DOC = path.join(process.cwd(), "scripts/pipeline-v6/spike-pandoc/reference-gost.docx");

// мм → twentieths of a point: mm * 56.6929 ≈ (1 mm = 56.6929 twips)
const mm = (n: number) => Math.round(n * 56.6929);

const PGMAR = `<w:pgMar w:top="${mm(20)}" w:right="${mm(10)}" w:bottom="${mm(20)}" w:left="${mm(30)}" w:header="720" w:footer="720" w:gutter="0"/>`;

function patchDocumentXml(xml: string): string {
  const newPgMar = PGMAR;
  if (/<w:pgMar[^/]*\/>/.test(xml)) {
    return xml.replace(/<w:pgMar[^/]*\/>/, newPgMar);
  }
  // inject inside sectPr
  return xml.replace(/<w:sectPr(\b[^>]*)>/, `<w:sectPr$1>${newPgMar}`);
}

const TIMES = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>`;
const SZ14 = `<w:sz w:val="28"/><w:szCs w:val="28"/>`; // half-points: 14pt = 28

function makeStyle(id: string, name: string, basedOn: string | null, pPr: string, rPr: string, isHeading = false, isDefault = false): string {
  const type = isHeading ? "paragraph" : "paragraph";
  const basedOnTag = basedOn ? `<w:basedOn w:val="${basedOn}"/>` : "";
  const defaultAttr = isDefault ? ' w:default="1"' : "";
  return `<w:style w:type="${type}"${defaultAttr} w:styleId="${id}"><w:name w:val="${name}"/>${basedOnTag}<w:pPr>${pPr}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;
}

const STYLES: Record<string, string> = {
  Normal: makeStyle(
    "Normal", "Normal", null,
    `<w:spacing w:line="360" w:lineRule="auto" w:before="0" w:after="0"/><w:ind w:firstLine="708"/><w:jc w:val="both"/>`,
    `${TIMES}${SZ14}`,
    false, true,
  ),
  Heading1: makeStyle(
    "Heading1", "heading 1", "Normal",
    `<w:pageBreakBefore/><w:spacing w:line="360" w:lineRule="auto" w:before="240" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>`,
    `${TIMES}<w:b/><w:bCs/><w:caps/>${SZ14}`,
    true,
  ),
  Heading2: makeStyle(
    "Heading2", "heading 2", "Normal",
    `<w:spacing w:line="360" w:lineRule="auto" w:before="240" w:after="120"/><w:ind w:firstLine="708"/><w:jc w:val="both"/><w:outlineLvl w:val="1"/>`,
    `${TIMES}<w:b/><w:bCs/>${SZ14}`,
    true,
  ),
  Heading3: makeStyle(
    "Heading3", "heading 3", "Normal",
    `<w:spacing w:line="360" w:lineRule="auto" w:before="240" w:after="120"/><w:ind w:firstLine="708"/><w:jc w:val="both"/><w:outlineLvl w:val="2"/>`,
    `${TIMES}<w:b/><w:bCs/><w:i/>${SZ14}`,
    true,
  ),
  BodyText: makeStyle(
    "BodyText", "Body Text", "Normal",
    `<w:spacing w:line="360" w:lineRule="auto" w:before="0" w:after="0"/><w:ind w:firstLine="708"/><w:jc w:val="both"/>`,
    `${TIMES}${SZ14}`,
  ),
};

function patchStylesXml(xml: string): string {
  // replace existing style blocks by id, or append inside <w:styles>
  let out = xml;
  for (const [id, styleXml] of Object.entries(STYLES)) {
    const re = new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`, "g");
    if (re.test(out)) {
      out = out.replace(re, styleXml);
    } else {
      out = out.replace("</w:styles>", `${styleXml}</w:styles>`);
    }
  }
  // set docDefaults to Times 14
  const docDefaults = `<w:docDefaults><w:rPrDefault><w:rPr>${TIMES}${SZ14}<w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`;
  if (/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.test(out)) {
    out = out.replace(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/, docDefaults);
  } else {
    out = out.replace(/<w:styles\b([^>]*)>/, `<w:styles$1>${docDefaults}`);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(DOC)) throw new Error(`not found: ${DOC}`);
  const buf = fs.readFileSync(DOC);
  const zip = await JSZip.loadAsync(buf);

  const docXml = await zip.file("word/document.xml")!.async("string");
  const newDocXml = patchDocumentXml(docXml);
  zip.file("word/document.xml", newDocXml);

  const stylesXml = await zip.file("word/styles.xml")!.async("string");
  const newStylesXml = patchStylesXml(stylesXml);
  zip.file("word/styles.xml", newStylesXml);

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(DOC, out);
  console.log(`patched ${DOC}`);
  console.log(`  margins: 20/10/20/30 mm`);
  console.log(`  font: Times New Roman 14pt, line 1.5, indent 12.5mm`);
  console.log(`  styles patched: ${Object.keys(STYLES).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
