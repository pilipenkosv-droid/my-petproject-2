// Builds pandoc reference-doc(s) from RulePack values. Патчит document.xml (поля)
// и styles.xml (docDefaults + Normal/Heading1..3/BodyText) в базовом docx.
//
// Run all packs: npx tsx scripts/pipeline-v6/tune-reference-doc.ts
// Run one pack:  npx tsx scripts/pipeline-v6/tune-reference-doc.ts gost-7.32

import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import type { RulePack } from "../../src/lib/pipeline-v6/rule-packs";
import { listRulePacks, resolveRulePack } from "../../src/lib/pipeline-v6/rule-packs";

const BASE_DOC = path.join(process.cwd(), "scripts/pipeline-v6/spike-pandoc/reference-gost.docx");

// mm → twentieths of a point (1 mm ≈ 56.6929 twips)
const mm = (n: number) => Math.round(n * 56.6929);
// mm → EMU-equivalent for firstLine indent (twips)
const mmToTwips = (n: number) => Math.round(n * 56.6929);

function fontsTag(family: string): string {
  return `<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}" w:eastAsia="${family}"/>`;
}

function szTag(pt: number): string {
  const half = Math.round(pt * 2);
  return `<w:sz w:val="${half}"/><w:szCs w:val="${half}"/>`;
}

// line spacing in 240ths (1.0 = 240, 1.5 = 360, 2.0 = 480)
function lineTag(lineSpacing: number): string {
  const line = Math.round(lineSpacing * 240);
  return `<w:spacing w:line="${line}" w:lineRule="auto" w:before="0" w:after="0"/>`;
}

function makeStyle(id: string, name: string, basedOn: string | null, pPr: string, rPr: string, isDefault = false): string {
  const basedOnTag = basedOn ? `<w:basedOn w:val="${basedOn}"/>` : "";
  const defaultAttr = isDefault ? ' w:default="1"' : "";
  return `<w:style w:type="paragraph"${defaultAttr} w:styleId="${id}"><w:name w:val="${name}"/>${basedOnTag}<w:pPr>${pPr}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;
}

function buildStyles(pack: RulePack): Record<string, string> {
  const { fontFamily, fontSize, lineSpacing, paragraphIndent } = pack.values;
  const FONT = fontsTag(fontFamily);
  const SZ = szTag(fontSize);
  const LINE = lineTag(lineSpacing);
  const INDENT = mmToTwips(paragraphIndent);

  return {
    Normal: makeStyle(
      "Normal", "Normal", null,
      `${LINE}<w:ind w:firstLine="${INDENT}"/><w:jc w:val="both"/>`,
      `${FONT}${SZ}`,
      true,
    ),
    Heading1: makeStyle(
      "Heading1", "heading 1", "Normal",
      `<w:pageBreakBefore/><w:spacing w:line="${Math.round(lineSpacing * 240)}" w:lineRule="auto" w:before="240" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>`,
      `${FONT}<w:b/><w:bCs/><w:caps/>${SZ}`,
    ),
    Heading2: makeStyle(
      "Heading2", "heading 2", "Normal",
      `<w:spacing w:line="${Math.round(lineSpacing * 240)}" w:lineRule="auto" w:before="240" w:after="120"/><w:ind w:firstLine="${INDENT}"/><w:jc w:val="both"/><w:outlineLvl w:val="1"/>`,
      `${FONT}<w:b/><w:bCs/>${SZ}`,
    ),
    Heading3: makeStyle(
      "Heading3", "heading 3", "Normal",
      `<w:spacing w:line="${Math.round(lineSpacing * 240)}" w:lineRule="auto" w:before="240" w:after="120"/><w:ind w:firstLine="${INDENT}"/><w:jc w:val="both"/><w:outlineLvl w:val="2"/>`,
      `${FONT}<w:b/><w:bCs/><w:i/>${SZ}`,
    ),
    BodyText: makeStyle(
      "BodyText", "Body Text", "Normal",
      `${LINE}<w:ind w:firstLine="${INDENT}"/><w:jc w:val="both"/>`,
      `${FONT}${SZ}`,
    ),
  };
}

function patchDocumentXml(xml: string, pack: RulePack): string {
  const { top, bottom, left, right } = pack.values.margins;
  const newPgMar = `<w:pgMar w:top="${mm(top)}" w:right="${mm(right)}" w:bottom="${mm(bottom)}" w:left="${mm(left)}" w:header="720" w:footer="720" w:gutter="0"/>`;
  if (/<w:pgMar[^/]*\/>/.test(xml)) {
    return xml.replace(/<w:pgMar[^/]*\/>/, newPgMar);
  }
  return xml.replace(/<w:sectPr(\b[^>]*)>/, `<w:sectPr$1>${newPgMar}`);
}

function patchStylesXml(xml: string, pack: RulePack): string {
  let out = xml;
  const styles = buildStyles(pack);
  for (const [id, styleXml] of Object.entries(styles)) {
    const re = new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`, "g");
    if (re.test(out)) {
      out = out.replace(re, styleXml);
    } else {
      out = out.replace("</w:styles>", `${styleXml}</w:styles>`);
    }
  }
  const FONT = fontsTag(pack.values.fontFamily);
  const SZ = szTag(pack.values.fontSize);
  const LINE_VAL = Math.round(pack.values.lineSpacing * 240);
  const docDefaults = `<w:docDefaults><w:rPrDefault><w:rPr>${FONT}${SZ}<w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="${LINE_VAL}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`;
  if (/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.test(out)) {
    out = out.replace(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/, docDefaults);
  } else {
    out = out.replace(/<w:styles\b([^>]*)>/, `<w:styles$1>${docDefaults}`);
  }
  return out;
}

export async function buildReferenceDoc(pack: RulePack, outPath: string): Promise<void> {
  if (!fs.existsSync(BASE_DOC)) throw new Error(`base doc not found: ${BASE_DOC}`);
  const buf = fs.readFileSync(BASE_DOC);
  const zip = await JSZip.loadAsync(buf);

  const docXml = await zip.file("word/document.xml")!.async("string");
  zip.file("word/document.xml", patchDocumentXml(docXml, pack));

  const stylesXml = await zip.file("word/styles.xml")!.async("string");
  zip.file("word/styles.xml", patchStylesXml(stylesXml, pack));

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
}

async function main() {
  const arg = process.argv[2];
  const packs = arg ? [resolveRulePack(arg)] : listRulePacks();
  for (const pack of packs) {
    if (!pack.referenceDocPath) {
      console.log(`skip ${pack.slug}: no referenceDocPath`);
      continue;
    }
    const outPath = path.join(process.cwd(), pack.referenceDocPath);
    await buildReferenceDoc(pack, outPath);
    const { margins, fontFamily, fontSize, lineSpacing, paragraphIndent } = pack.values;
    console.log(`built ${pack.slug} → ${pack.referenceDocPath}`);
    console.log(`  margins: ${margins.top}/${margins.right}/${margins.bottom}/${margins.left} mm`);
    console.log(`  font: ${fontFamily} ${fontSize}pt, line ${lineSpacing}, indent ${paragraphIndent}mm`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
