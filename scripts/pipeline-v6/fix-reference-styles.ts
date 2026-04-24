// Patch scripts/pipeline-v6/spike-pandoc/reference-gost.docx:
//   - Heading*Char character styles inherit theme accent color (0F4761 blue)
//     and oversized sz (40/32/28/26/...) from Word's default Office theme.
//   - GOST 7.32: headings bold, same size as body (14pt = sz 28), color black.
//   - Pandoc applies Heading1/Heading2 paragraph style; Word/LibreOffice pulls
//     linked Heading1Char rPr on runs → blue oversized text in PDF.
//
// Fix: strip theme color and oversized sz from Heading[1-9]Char and from any
// Heading[4-9] paragraph rPr that carries the same. Leave structural attrs
// (<w:b/>, <w:caps/>, <w:rFonts/>) intact; just normalize color + size.
//
// Run once, commit the resulting docx. Idempotent.

import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";

const DOCX = path.resolve("scripts/pipeline-v6/spike-pandoc/reference-gost.docx");

function patchStyleBlock(xml: string, styleIdPattern: RegExp): { xml: string; patched: number } {
  let patched = 0;
  const out = xml.replace(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g, (block) => {
    const m = /w:styleId="([^"]+)"/.exec(block);
    if (!m || !styleIdPattern.test(m[1])) return block;
    let next = block;
    // Drop theme color. Set fixed black.
    next = next.replace(/<w:color\s[^/]*\/>/g, "");
    // Drop oversized sz/szCs so heading inherits body 28 (14pt).
    next = next.replace(/<w:sz\s[^/]*\/>/g, "");
    next = next.replace(/<w:szCs\s[^/]*\/>/g, "");
    // Drop majorHAnsi theme font so heading inherits body Times New Roman.
    next = next.replace(/<w:rFonts\s[^>]*asciiTheme="majorHAnsi"[^/]*\/>/g, "");
    if (next !== block) patched++;
    return next;
  });
  return { xml: out, patched };
}

function injectSuppressAutoHyphens(xml: string): { xml: string; injected: boolean } {
  // `<w:autoHyphenation w:val="false"/>` in settings.xml is a Word-only flag;
  // LibreOffice honours paragraph-level <w:suppressAutoHyphens/>. Adding it to
  // docDefaults/pPrDefault makes every paragraph inherit "no auto-hyphenation"
  // unless it explicitly opts in. Fixes auto-hyphen artefacts like "пере-нос"
  // that reviewers flagged on >300 line-ends across cycle 9.
  if (/<w:suppressAutoHyphens\b/.test(xml)) return { xml, injected: false };
  const out = xml.replace(
    /<w:pPrDefault>\s*<w:pPr>/,
    `<w:pPrDefault><w:pPr><w:suppressAutoHyphens w:val="true"/>`,
  );
  return { xml: out, injected: out !== xml };
}

async function main() {
  if (!fs.existsSync(DOCX)) {
    console.error("reference-gost.docx not found at " + DOCX);
    process.exit(1);
  }
  const buf = fs.readFileSync(DOCX);
  const zip = await JSZip.loadAsync(buf);
  const stylesFile = zip.file("word/styles.xml");
  if (!stylesFile) { console.error("word/styles.xml missing"); process.exit(2); }
  const xml = await stylesFile.async("string");

  const step1 = patchStyleBlock(xml, /^Heading[1-9]Char$/);
  const step2 = patchStyleBlock(step1.xml, /^Heading[4-9]$/);
  // TOCHeading inherits from Heading1 in Word's default template and pulls the
  // theme accent1 colour (0F4761 blue). Pipeline-v6 uses TOCHeading for the
  // "СОДЕРЖАНИЕ" label, so that label would render blue in the PDF unless we
  // strip colour from this style too.
  const step3 = patchStyleBlock(step2.xml, /^TOCHeading$/);
  // Hyperlink style inherits theme accent1 (teal #156082). For GOST body text
  // we want hyperlinks in normal black; colour-marking hyperlinks registers
  // to reviewers as heading_wrong_color when citations appear in a section
  // title area.
  const step4 = patchStyleBlock(step3.xml, /^Hyperlink$/);
  const hyph = injectSuppressAutoHyphens(step4.xml);

  const patched = step1.patched + step2.patched + step3.patched + step4.patched + (hyph.injected ? 1 : 0);
  if (patched === 0) {
    console.log("no matching styles patched — already clean?");
    return;
  }
  zip.file("word/styles.xml", hyph.xml);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(DOCX, out);
  console.log(JSON.stringify({
    headingCharStylesPatched: step1.patched,
    headingParaStylesPatched: step2.patched,
    tocHeadingPatched: step3.patched,
    hyperlinkPatched: step4.patched,
    suppressAutoHyphensInjected: hyph.injected,
    outPath: DOCX,
    outSize: out.length,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
