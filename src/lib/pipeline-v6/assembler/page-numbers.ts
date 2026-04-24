// Inject page numbers into the assembled docx via a <w:footer> part.
// Per ГОСТ 7.32-2017: page numbers are arabic, centered at the bottom of
// every page except the title page. Numbering starts from 1 on the title
// page but the number is not displayed on it.
//
// Pandoc's reference-doc does not automatically wire up a footer. We:
//   1. Add word/footer2.xml with a centered PAGE field (visible on all
//      body pages).
//   2. Add word/_rels/document.xml.rels reference for the footer part.
//   3. Add Override entry in [Content_Types].xml.
//   4. For the titlepage section: <w:titlePg/> in sectPr + separate
//      empty word/footer1.xml (used only on the first page).
//   5. Add <w:footerReference w:type="default" r:id="..."/> to the main
//      sectPr.

import JSZip from "jszip";

const FOOTER_DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:fldChar w:fldCharType="begin"/>
    </w:r>
    <w:r>
      <w:instrText xml:space="preserve"> PAGE \\* MERGEFORMAT </w:instrText>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="separate"/>
    </w:r>
    <w:r>
      <w:t>1</w:t>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="end"/>
    </w:r>
  </w:p>
</w:ftr>`;

const FOOTER_FIRSTPAGE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>
</w:ftr>`;

export async function injectPageNumbers(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Write footer parts.
  zip.file("word/footerPipeline.xml", FOOTER_DEFAULT_XML);
  zip.file("word/footerPipelineFirst.xml", FOOTER_FIRSTPAGE_XML);

  // 2. Add relationships in word/_rels/document.xml.rels.
  const relsPath = "word/_rels/document.xml.rels";
  const relsFile = zip.file(relsPath);
  if (!relsFile) return buffer;
  let rels = await relsFile.async("string");
  const defaultRid = "rIdPipelineFooter1";
  const firstRid = "rIdPipelineFooter2";
  const hasDefault = rels.includes(`Id="${defaultRid}"`);
  const hasFirst = rels.includes(`Id="${firstRid}"`);
  const defaultRel = `<Relationship Id="${defaultRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footerPipeline.xml"/>`;
  const firstRel = `<Relationship Id="${firstRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footerPipelineFirst.xml"/>`;
  if (!hasDefault || !hasFirst) {
    const inject = (!hasDefault ? defaultRel : "") + (!hasFirst ? firstRel : "");
    rels = rels.replace(/<\/Relationships>\s*$/, `${inject}</Relationships>`);
    zip.file(relsPath, rels);
  }

  // 3. Register content types.
  const ctPath = "[Content_Types].xml";
  const ctFile = zip.file(ctPath);
  if (ctFile) {
    let ct = await ctFile.async("string");
    const footerOverride = `<Override PartName="/word/footerPipeline.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`;
    const footerFirstOverride = `<Override PartName="/word/footerPipelineFirst.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`;
    if (!ct.includes("/word/footerPipeline.xml")) {
      ct = ct.replace(/<\/Types>\s*$/, `${footerOverride}${footerFirstOverride}</Types>`);
      zip.file(ctPath, ct);
    }
  }

  // 4. Patch sectPr: add titlePg + footerReference entries. If sectPr doesn't
  // exist, nothing to patch.
  const docFile = zip.file("word/document.xml");
  if (!docFile) return buffer;
  let docXml = await docFile.async("string");
  docXml = docXml.replace(/<w:sectPr\b([^>]*)>/g, (match, attrs) => {
    // Idempotency: skip if already patched.
    if (/w:footerReference[^/]*Target="footerPipeline\.xml"/.test(match)) return match;
    const titlePg = /<w:titlePg\s*\/>/.test(attrs) ? "" : "<w:titlePg/>";
    const refs =
      `<w:footerReference w:type="default" r:id="${defaultRid}"/>` +
      `<w:footerReference w:type="first" r:id="${firstRid}"/>`;
    return `<w:sectPr${attrs}>${refs}${titlePg}`;
  });
  // Ensure xmlns:r present on document element (for r:id).
  docXml = docXml.replace(/<w:document\b([^>]*)>/, (m, attrs: string) => {
    if (/xmlns:r=/.test(attrs)) return m;
    return `<w:document${attrs} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
  });
  zip.file("word/document.xml", docXml);

  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
