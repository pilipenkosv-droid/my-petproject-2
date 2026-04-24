// Keep-together helpers for large floating elements (tables + figures).
//
// Why: Word/LibreOffice will happily split a 40-row table across pages, or put
// a figure caption on one page and the image on the next. A human editor
// would push such an element to its own page rather than break it mid-item.
//
// Strategy: in the assembled docx we set paragraph-level keep-together hints:
//   - <w:keepNext/> on the caption paragraph (keeps it on the same page as
//     the following image/table paragraph)
//   - <w:keepLines/> on each paragraph inside a table cell (prevents breaking
//     individual cell content across pages)
//   - For figures (<w:drawing> inside <w:p>), add keepNext/keepLines to their
//     paragraph so the image sticks with its preceding caption paragraph.
//
// Notes:
//   - This does NOT force a page break before every figure/table — that would
//     over-inflate page count. We let Word/LibreOffice flow naturally and rely
//     on keepNext to pull a large element to the next page only if it wouldn't
//     fit otherwise.
//   - Tables with <w:tbl> have their own mechanism: add <w:cantSplit/> inside
//     each <w:trPr> so the ROW stays together. For the whole table to stay
//     together, add <w:keepNext/> on the paragraph IMMEDIATELY preceding the
//     table (Word's convention).

import JSZip from "jszip";

function addToExistingPPr(pPr: string, toInject: string): string {
  if (pPr.includes(toInject)) return pPr;
  return pPr.replace(/<w:pPr>/, `<w:pPr>${toInject}`);
}

/** Ensure the paragraph has <w:pPr>...</w:pPr> and inject given children if
 *  not already present. */
function ensurePPrWith(paragraphXml: string, toInject: string): string {
  if (!/<w:pPr>/.test(paragraphXml)) {
    // inject after opening <w:p> tag
    return paragraphXml.replace(
      /^<w:p\b([^>]*)>/,
      `<w:p$1><w:pPr>${toInject}</w:pPr>`,
    );
  }
  return paragraphXml.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, (_m, inside) => {
    if (inside.includes(toInject.trim())) return `<w:pPr>${inside}</w:pPr>`;
    return `<w:pPr>${toInject}${inside}</w:pPr>`;
  });
}

/** Add <w:cantSplit/> to every <w:trPr> inside tables. If trPr is missing,
 *  inject one with only cantSplit. */
function applyCantSplitToRows(xml: string): string {
  // Walk tables
  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    return tbl.replace(/<w:tr\b([^>]*)>([\s\S]*?)<\/w:tr>/g, (tr, attrs, inner) => {
      if (/<w:trPr>/.test(inner)) {
        if (/<w:cantSplit\b/.test(inner)) return tr;
        const patched = inner.replace(
          /<w:trPr>([\s\S]*?)<\/w:trPr>/,
          `<w:trPr><w:cantSplit/>$1</w:trPr>`,
        );
        return `<w:tr${attrs}>${patched}</w:tr>`;
      }
      return `<w:tr${attrs}><w:trPr><w:cantSplit/></w:trPr>${inner}</w:tr>`;
    });
  });
}

/** Add <w:keepNext/> to the paragraph right before each <w:tbl>. */
function applyKeepNextBeforeTables(xml: string): string {
  return xml.replace(
    /(<w:p\b[^>]*>[\s\S]*?<\/w:p>)(\s*<w:tbl>)/g,
    (_m, p, tbl) => {
      const patched = ensurePPrWith(p, "<w:keepNext/>");
      return patched + tbl;
    },
  );
}

/** Paragraphs whose runs contain a <w:drawing> (image) — attach keepLines so
 *  the figure doesn't split; and keepNext on the caption (the paragraph
 *  immediately preceding). */
function applyFigureKeepRules(xml: string): string {
  // Mark figure paragraphs: those with <w:drawing>.
  return xml.replace(
    /(<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<w:drawing\b[\s\S]*?<\/w:p>)/g,
    (p) => ensurePPrWith(p, "<w:keepLines/><w:keepNext/>"),
  );
}

export async function applyKeepTogetherRules(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return buffer;
  let xml = await docFile.async("string");
  const before = xml;
  xml = applyCantSplitToRows(xml);
  xml = applyKeepNextBeforeTables(xml);
  xml = applyFigureKeepRules(xml);
  if (xml === before) return buffer;
  zip.file("word/document.xml", xml);
  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
