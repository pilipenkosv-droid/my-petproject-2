// Post-process pandoc output to produce a reliable TOC in headless PDF output.
//
// Problem: pandoc emits a dynamic TOC as a Word field (`TOC \o "1-2" \h \z \u`)
// wrapped in a structured-document-tag (SDT). LibreOffice's
// `--convert-to "pdf:writer_pdf_Export:UpdateFields=true"` does NOT regenerate
// TOC fields — it only updates text fields (dates, page numbers in headers).
// Result: headless PDFs show an empty TOC section.
//
// Fix: build a STATIC TOC ourselves.
//   1. Walk word/document.xml for paragraphs with pStyle=Heading1/Heading2/3.
//   2. Extract each heading's plain text.
//   3. Replace the dynamic TOC field paragraph with a block of static
//      paragraphs, one per heading, using TOCn styles with right-aligned
//      tab leader dots. Page placeholder is "—" (two-pass with real page
//      numbers is deferred).
//   4. Unwrap the surrounding SDT so the static paragraphs flow freely.
//   5. Keep <w:updateFields w:val="true"/> for other fields (page numbers in
//      headers/footers).

import JSZip from "jszip";

const SDT_TOC_RE =
  /<w:sdt>\s*<w:sdtPr>\s*<w:docPartObj>\s*<w:docPartGallery\s+w:val="Table of Contents"\s*\/>\s*<w:docPartUnique\s*\/>\s*<\/w:docPartObj>\s*<\/w:sdtPr>\s*<w:sdtContent>([\s\S]*?)<\/w:sdtContent>\s*<\/w:sdt>/;

// Match the TOC field paragraph (the one containing `<w:instrText>TOC ...`)
// so we can replace it with static entries. Non-greedy.
const TOC_FIELD_PARAGRAPH_RE =
  /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<w:instrText[^>]*>\s*TOC\s[^<]*<\/w:instrText>[\s\S]*?<\/w:p>/;

interface Heading {
  level: 1 | 2;
  text: string;
}

// Artificial headings we inject for appendix sections (tables/images) should
// not appear in the TOC as top-level entries — they are technical containers,
// not real content chapters. Also: TOC title ("СОДЕРЖАНИЕ") must never
// self-reference.
const TOC_EXCLUDE_TEXTS = new Set<string>([
  "Приложение А. Таблицы",
  "Приложение. Дополнительные изображения",
  "СОДЕРЖАНИЕ",
  "ОГЛАВЛЕНИЕ",
]);

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractHeadings(docXml: string): Heading[] {
  const headings: Heading[] = [];
  const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  const styleRe = /<w:pStyle\s+w:val="(Heading[12])"\s*\/>/;
  const textRunRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  // Deduplicate consecutive identical headings (artefact of mammoth emitting
  // the same title twice — once as TOC anchor, once as heading text).
  let lastText = "";
  while ((m = pRe.exec(docXml))) {
    const inner = m[1];
    const styleMatch = styleRe.exec(inner);
    if (!styleMatch) continue;
    const level = parseInt(styleMatch[1].slice(-1), 10) as 1 | 2;
    let text = "";
    let tm: RegExpExecArray | null;
    while ((tm = textRunRe.exec(inner))) text += decodeXmlEntities(tm[1]);
    text = text.trim();
    if (!text) continue;
    if (TOC_EXCLUDE_TEXTS.has(text)) continue;
    if (text === lastText) continue; // skip immediate dup
    headings.push({ level, text });
    lastText = text;
  }
  return headings;
}

/** Find the XML range of a previously-built static TOC block (a contiguous
 *  run of TOC1/TOC2 paragraphs followed by the trailing page-break). Returns
 *  null if no such block present. */
function findStaticTocRange(xml: string): { start: number; end: number } | null {
  const tocRe = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?pStyle\s+w:val="TOC[12]"[\s\S]*?<\/w:p>/g;
  let first = -1;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = tocRe.exec(xml))) {
    if (first === -1) first = m.index;
    last = m.index + m[0].length;
  }
  if (first === -1) return null;
  // Extend past trailing page-break paragraph if present.
  const tail = xml.slice(last, last + 80);
  const br = /^\s*<w:p>\s*<w:r>\s*<w:br w:type="page"\s*\/>\s*<\/w:r>\s*<\/w:p>/.exec(tail);
  if (br) return { start: first, end: last + br[0].length };
  return { start: first, end: last };
}

function buildStaticTocBlock(headings: Heading[]): string {
  // Right-aligned tab leader dots at 9000 twips (~15 cm, fits A4 body).
  // Trailing page-break paragraph forces the next section (usually ВВЕДЕНИЕ)
  // to start on a fresh page — per ГОСТ 7.32-2017 «СОДЕРЖАНИЕ» is an
  // independent structural element, not shared with body text.
  const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  const entries = headings.map((h) => {
    const style = h.level === 1 ? "TOC1" : "TOC2";
    const indent = h.level === 1 ? 0 : 220;
    return (
      `<w:p>` +
      `<w:pPr>` +
      `<w:pStyle w:val="${style}"/>` +
      `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs>` +
      (indent > 0 ? `<w:ind w:left="${indent}"/>` : "") +
      `</w:pPr>` +
      `<w:r><w:t xml:space="preserve">${encodeXmlText(h.text)}</w:t></w:r>` +
      `<w:r><w:tab/></w:r>` +
      `<w:r><w:t>—</w:t></w:r>` +
      `</w:p>`
    );
  }).join("");
  return entries + pageBreak;
}

export async function fixupToc(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return buffer;
  let xml = await docFile.async("string");

  // Unwrap SDT wrapper so the TOC field paragraph sits at body level.
  xml = xml.replace(SDT_TOC_RE, (_m, inner: string) => inner);

  // Walk headings (outside the TOC block — TOC itself has no Heading styles).
  const headings = extractHeadings(xml);

  // Replace the dynamic TOC field paragraph (first pass) OR a previously-
  // built static TOC block (subsequent passes, e.g. after placeholder
  // insertion adds new headings that should appear in TOC).
  if (headings.length > 0) {
    if (TOC_FIELD_PARAGRAPH_RE.test(xml)) {
      // First pass: dynamic pandoc TOC field still present.
      xml = xml.replace(TOC_FIELD_PARAGRAPH_RE, buildStaticTocBlock(headings));
    } else {
      // Idempotent pass: strip existing static TOC block (TOC1/TOC2
      // paragraphs + their trailing page-break paragraph) and insert
      // a fresh one at the same position.
      const staticBlock = findStaticTocRange(xml);
      if (staticBlock) {
        xml = xml.slice(0, staticBlock.start) +
              buildStaticTocBlock(headings) +
              xml.slice(staticBlock.end);
      }
    }
  }

  zip.file("word/document.xml", xml);

  // settings.xml:
  //   - <w:updateFields> — let readers refresh remaining field types.
  //   - <w:autoHyphenation w:val="false"/> — disable soft hyphenation. Word
  //     defaults to enabling it, which produces "пере-нос" line-end breaks
  //     that reviewers flagged ("КCPo had 221 such cases"). GOST academic
  //     style does not use soft hyphens.
  const settingsFile = zip.file("word/settings.xml");
  if (settingsFile) {
    let settingsXml = await settingsFile.async("string");
    let settingsChanged = false;
    if (!/<w:updateFields\b/.test(settingsXml)) {
      settingsXml = settingsXml.replace(
        /<w:settings\b([^>]*)>/,
        `<w:settings$1><w:updateFields w:val="true"/>`,
      );
      settingsChanged = true;
    }
    if (!/<w:autoHyphenation\b/.test(settingsXml)) {
      settingsXml = settingsXml.replace(
        /<w:settings\b([^>]*)>/,
        `<w:settings$1><w:autoHyphenation w:val="false"/>`,
      );
      settingsChanged = true;
    }
    if (settingsChanged) zip.file("word/settings.xml", settingsXml);
  }

  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
