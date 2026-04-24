// Inject friendly placeholder blocks for mandatory sections that are missing
// from the student's work. Each placeholder is a self-contained Heading1
// paragraph followed by:
//   - a "why this section matters" note (one paragraph)
//   - a bulleted "what should go here" structure
//   - an abstract example showing information density
//
// Placeholder paragraphs use italic text via `<w:i/>` on each run and grey
// colour (`<w:color w:val="595959"/>`) so students see they are guidance, not
// their own content. Student can delete them once the section is written.
//
// Insertion position per missing section:
//   - ВВЕДЕНИЕ → after СОДЕРЖАНИЕ (or at body start if no TOC)
//   - ЗАКЛЮЧЕНИЕ → before СПИСОК ИСТОЧНИКОВ (or at body end)
//   - СПИСОК ИСТОЧНИКОВ → at body end
//   - РЕФЕРАТ → right after title page / before СОДЕРЖАНИЕ
//   - СОДЕРЖАНИЕ → not inserted as placeholder (fixupToc handles this)

import JSZip from "jszip";
import type { ExpectedSection } from "./expected-sections";
import type { SectionDetection } from "./section-detector";

// Visual signals used in placeholder blocks. Italic/colour get stripped by
// the text checker's no-colored-text rule, so we rely on:
//   - a leading warning glyph ⚠ so the block is visually distinct
//   - a left paragraph border (<w:pBdr><w:left .../></w:pBdr>) which the
//     checker leaves alone — appears as a vertical accent stripe, like a
//     Markdown blockquote.

function encodeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LEFT_BORDER_PPR =
  `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="auto"/></w:pBdr>` +
  `<w:ind w:left="240"/>`;

function buildRun(text: string, opts?: { bold?: boolean }): string {
  const rPr = opts?.bold ? `<w:rPr><w:b/><w:bCs/></w:rPr>` : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${encodeXmlText(text)}</w:t></w:r>`;
}

function buildHeading(text: string): string {
  return (
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>` +
    buildRun(text) +
    `</w:p>`
  );
}

function buildPlaceholderParagraph(text: string, opts?: { bold?: boolean }): string {
  // Paragraph text may contain \n for multi-line; use <w:br/> between lines.
  const lines = text.split("\n");
  const runs = lines
    .map((line, i) => (i === 0 ? "" : `<w:r><w:br/></w:r>`) + buildRun(line, opts))
    .join("");
  return `<w:p><w:pPr>${LEFT_BORDER_PPR}</w:pPr>${runs}</w:p>`;
}

function buildBulletList(items: string[]): string {
  return items.map((item) => buildPlaceholderParagraph(`— ${item}`)).join("");
}

/** Build the full XML block for one missing section's placeholder. The
 *  sub-note is a plain italic paragraph, NOT a Heading2 — otherwise
 *  `fixupToc` would pick it up as a heading and inject it into the TOC,
 *  which also strips its colour/italic styling. */
function buildPlaceholderBlock(section: ExpectedSection): string {
  const { placeholder } = section;
  const headerNote = buildPlaceholderParagraph(
    "⚠ Этого раздела нет в вашей работе — Diplox оставил подсказку ниже. Отредактируйте или удалите этот блок.",
    { bold: true },
  );
  return (
    buildHeading(section.canonical) +
    headerNote +
    buildPlaceholderParagraph(placeholder.purpose) +
    buildPlaceholderParagraph("Что обычно сюда входит:", { bold: true }) +
    buildBulletList(placeholder.structure) +
    buildPlaceholderParagraph(placeholder.example)
  );
}

interface InsertionPlan {
  section: ExpectedSection;
  strategy: "after" | "before" | "end" | "body-start" | "body-end";
  /** Anchor heading canonical text for "after" / "before" strategies. */
  anchor?: string;
  canonicalOrder?: number;
}


// Canonical order of structural sections in a GOST work (0 = earliest).
const CANONICAL_ORDER: Record<string, number> = {
  "РЕФЕРАТ": 1,
  "СОДЕРЖАНИЕ": 2,
  "ВВЕДЕНИЕ": 3,
  // body chapters fall between here
  "ЗАКЛЮЧЕНИЕ": 8,
  "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ": 9,
};

function planInsertions(detections: SectionDetection[]): InsertionPlan[] {
  const plans: InsertionPlan[] = [];
  for (const d of detections) {
    if (d.present || !d.section.mandatory) continue;
    const can = d.section.canonical;
    const order = CANONICAL_ORDER[can] ?? 50;
    if (can === "СОДЕРЖАНИЕ") continue; // handled by fixupToc
    if (can === "РЕФЕРАТ") {
      // РЕФЕРАТ is placed right after titlepage, before TOC. Use body-start
      // with canonicalOrder=1 (will be ordered before ВВЕДЕНИЕ by
      // bodyStartPlans logic — though inserter current doesn't reorder
      // multiple body-start entries; they all go at the same position).
      plans.push({ section: d.section, strategy: "body-start", canonicalOrder: order });
    } else if (can === "ВВЕДЕНИЕ") {
      // ВВЕДЕНИЕ placeholder is inserted AFTER the full TOC block (end of
      // static TOC + its page break). Using anchor "СОДЕРЖАНИЕ" with
      // strategy "after" was wrong — it landed between TOCHeading and TOC
      // entries. body-start uses findEndOfStaticToc which returns position
      // AFTER the whole TOC block (entries + trailing page break).
      plans.push({ section: d.section, strategy: "body-start", canonicalOrder: order });
    } else if (can === "ЗАКЛЮЧЕНИЕ") {
      plans.push({ section: d.section, strategy: "before", anchor: "СПИСОК", canonicalOrder: order });
    } else if (can === "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ") {
      plans.push({ section: d.section, strategy: "body-end", canonicalOrder: order });
    } else {
      plans.push({ section: d.section, strategy: "body-end", canonicalOrder: order });
    }
  }
  return plans;
}

function findHeadingParagraphPos(
  xml: string,
  anchorPrefix: string,
  which: "before" | "after",
): number {
  // Scan <w:p> with Heading1/Heading2/TOCHeading whose text contains
  // anchorPrefix (uppercase). Return the end position of the matching
  // <w:p> for "after", start position for "before".
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const needle = anchorPrefix.toUpperCase();
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[0];
    if (!/pStyle\s+w:val="(Heading[12]|TOCHeading)"/.test(block)) continue;
    const texts = Array.from(block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
      .map((tm) => tm[1])
      .join("")
      .toUpperCase();
    if (texts.includes(needle)) {
      return which === "after" ? m.index + block.length : m.index;
    }
  }
  return -1;
}

/** Find the end position of the TOC block. Handles both states:
 *    (a) SDT-wrapped dynamic TOC (pandoc's default output): return position
 *        right after the closing </w:sdt>.
 *    (b) Static TOC (post-fixupToc): return position after last TOC1/2
 *        entry + its trailing page-break paragraph.
 *  Returns -1 if no TOC present. */
function findEndOfStaticToc(xml: string): number {
  // (a) SDT-wrapped TOC (dynamic). Find opening w:sdt containing
  // "Table of Contents" and its closing </w:sdt>.
  const sdtOpen = xml.indexOf(`<w:docPartGallery w:val="Table of Contents"`);
  if (sdtOpen !== -1) {
    const sdtStart = xml.lastIndexOf("<w:sdt>", sdtOpen);
    if (sdtStart !== -1) {
      const sdtEnd = xml.indexOf("</w:sdt>", sdtOpen);
      if (sdtEnd !== -1) return sdtEnd + "</w:sdt>".length;
    }
  }
  // (b) Static TOC paragraphs — last TOC1/TOC2 entry.
  const tocRe = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?pStyle\s+w:val="TOC[12]"[\s\S]*?<\/w:p>/g;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = tocRe.exec(xml))) lastEnd = m.index + m[0].length;
  if (lastEnd === -1) return -1;
  // Trailing page-break paragraph right after last entry.
  const breakRe = /<w:p>\s*<w:r>\s*<w:br w:type="page"\s*\/>\s*<\/w:r>\s*<\/w:p>/g;
  breakRe.lastIndex = lastEnd;
  const brMatch = breakRe.exec(xml);
  if (brMatch && brMatch.index - lastEnd < 50) {
    return brMatch.index + brMatch[0].length;
  }
  return lastEnd;
}

export async function insertMissingSectionPlaceholders(
  buffer: Buffer,
  detections: SectionDetection[],
): Promise<{ buffer: Buffer; inserted: string[] }> {
  const missing = detections.filter((d) => !d.present && d.section.mandatory);
  if (missing.length === 0) return { buffer, inserted: [] };

  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return { buffer, inserted: [] };
  let xml = await docFile.async("string");

  const plans = planInsertions(detections);
  const inserted: string[] = [];

  // Try anchor-based positioning first, track which succeeded.
  const anchorPlans = plans.filter((p) => p.strategy === "after" || p.strategy === "before");
  const anchorResolved = anchorPlans.map((p) => {
    const pos = p.anchor
      ? findHeadingParagraphPos(xml, p.anchor, p.strategy as "before" | "after")
      : -1;
    return { plan: p, pos };
  });

  // Split: anchor hits (real position) vs anchor misses (fall back to canonical
  // position). Anchor misses are treated as body-start insertions to preserve
  // canonical order.
  const anchorHits = anchorResolved.filter((x) => x.pos !== -1).sort((a, b) => b.pos - a.pos);
  const anchorMisses = anchorResolved.filter((x) => x.pos === -1).map((x) => x.plan);

  // 1. Anchor-based insertions, applied from end-of-xml back to start so
  //    earlier offsets stay valid.
  for (const { plan, pos } of anchorHits) {
    const blockXml = buildPlaceholderBlock(plan.section);
    xml = xml.slice(0, pos) + blockXml + xml.slice(pos);
    inserted.push(plan.section.canonical);
  }

  // 2. body-start insertions: placeholders whose anchor was missing OR
  //    which canonically belong at the top of the body (РЕФЕРАТ, ВВЕДЕНИЕ).
  //    Insert after the last existing pre-body section — typically the
  //    titlepage <w:br w:type="page"/> or the TOC page-break we emit in
  //    fixupToc. To keep insertion position stable, we insert them right
  //    after the FIRST <w:body>-level <w:br w:type="page"/> (= end of
  //    titlepage). If no page break exists, insert at the start of body.
  const bodyStartPlans = anchorMisses
    .filter((p) => (p.canonicalOrder ?? 50) <= 3) // РЕФЕРАТ, СОДЕРЖАНИЕ, ВВЕДЕНИЕ
    .sort((a, b) => (a.canonicalOrder ?? 50) - (b.canonicalOrder ?? 50));

  if (bodyStartPlans.length > 0) {
    const blockXml = bodyStartPlans.map((p) => buildPlaceholderBlock(p.section)).join("");
    // Place AFTER the last page-break in the prologue (titlepage → TOC →
    // first chapter). We look for the TOC1/2 static block and insert right
    // after the page-break paragraph that fixupToc emits at the end of TOC.
    // Fallback: insert after the first page-break (end of titlepage).
    const tocEnd = findEndOfStaticToc(xml);
    let insertAt = -1;
    if (tocEnd !== -1) insertAt = tocEnd;
    if (insertAt === -1) {
      const brMatch = xml.match(/<w:p>\s*<w:r>\s*<w:br w:type="page"\s*\/>\s*<\/w:r>\s*<\/w:p>/);
      if (brMatch && brMatch.index !== undefined) insertAt = brMatch.index + brMatch[0].length;
    }
    if (insertAt !== -1) {
      xml = xml.slice(0, insertAt) + blockXml + xml.slice(insertAt);
    } else {
      // No titlepage break found — insert right after <w:body ...>
      xml = xml.replace(/<w:body\b([^>]*)>/, `<w:body$1>${blockXml}`);
    }
    bodyStartPlans.forEach((p) => inserted.push(p.section.canonical));
  }

  // 3. body-end insertions: СПИСОК, ЗАКЛЮЧЕНИЕ (if anchor missed), other.
  const bodyEndPlans = [
    ...plans.filter((p) => p.strategy === "body-end"),
    ...anchorMisses.filter((p) => (p.canonicalOrder ?? 50) > 3),
  ].sort((a, b) => (a.canonicalOrder ?? 50) - (b.canonicalOrder ?? 50));

  if (bodyEndPlans.length > 0) {
    const blockXml = bodyEndPlans.map((p) => buildPlaceholderBlock(p.section)).join("");
    const sectPrMatch = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*<\/w:body>/);
    if (sectPrMatch && sectPrMatch.index !== undefined) {
      xml = xml.slice(0, sectPrMatch.index) + blockXml + xml.slice(sectPrMatch.index);
    } else {
      xml = xml.replace("</w:body>", `${blockXml}</w:body>`);
    }
    bodyEndPlans.forEach((p) => inserted.push(p.section.canonical));
  }

  zip.file("word/document.xml", xml);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer: out, inserted };
}
