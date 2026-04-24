// Detect which expected sections are present in the assembled docx output.
//
// Walks word/document.xml looking at Heading1/Heading2 paragraphs. For each
// heading we collect its plain text, then match against the synonym list of
// every expected section. First match wins (first section consumed by first
// matching heading).

import type { ExpectedSection } from "./expected-sections";

export interface SectionDetection {
  section: ExpectedSection;
  present: boolean;
  /** Zero-based paragraph index where the heading was found, if present. */
  headingIndex?: number;
}

// We accept Heading1/Heading2 AND TOC1/TOC2 AND TOCHeading as "heading-like"
// paragraphs. After fixupToc, TOC entries reflect the real heading text —
// if a section appears in TOC it is present in the document regardless of
// whether mammoth preserved its pStyle.
const HEADING_STYLE_RE = /<w:pStyle\s+w:val="(Heading[12]|TOC[12]|TOCHeading)"\s*\/>/;
const PARAGRAPH_RE = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
const TEXT_RUN_RE = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normaliseHeading(text: string): string {
  return text
    .replace(/[.,:;!?\s]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Returns list of heading texts (in document order) with their paragraph
 *  index in document.xml. */
export function collectHeadings(docXml: string): Array<{ index: number; text: string }> {
  const out: Array<{ index: number; text: string }> = [];
  let m: RegExpExecArray | null;
  let idx = 0;
  PARAGRAPH_RE.lastIndex = 0;
  while ((m = PARAGRAPH_RE.exec(docXml))) {
    const inner = m[1];
    if (!HEADING_STYLE_RE.test(inner)) { idx++; continue; }
    let text = "";
    let tm: RegExpExecArray | null;
    TEXT_RUN_RE.lastIndex = 0;
    while ((tm = TEXT_RUN_RE.exec(inner))) text += decodeEntities(tm[1]);
    text = text.trim();
    if (text) out.push({ index: idx, text });
    idx++;
  }
  return out;
}

/** For each expected section, determine if a matching heading exists in the
 *  document. Matching is lenient (case + punctuation insensitive, synonyms).
 *  Fallback: if no styled heading found, scan all paragraph text as plain
 *  token — catches cases where author wrote "ЗАКЛЮЧЕНИЕ" as body text. */
export function detectSections(
  docXml: string,
  expected: ExpectedSection[],
): SectionDetection[] {
  const headings = collectHeadings(docXml);
  const consumed = new Set<number>();

  // Also build a "bag of normalised short-paragraph tokens" — any paragraph
  // whose plain text (no style) is short enough to look like a heading. Used
  // as fallback when style-based match fails.
  const shortBodyTexts = collectShortBodyTexts(docXml);

  const detections: SectionDetection[] = [];
  for (const section of expected) {
    const synonymsNorm = new Set(
      [section.canonical, ...section.synonyms].map(normaliseHeading),
    );
    let hit: { index: number; text: string } | undefined;
    for (const h of headings) {
      if (consumed.has(h.index)) continue;
      const norm = normaliseHeading(h.text);
      if (synonymsNorm.has(norm)) { hit = h; break; }
      for (const syn of synonymsNorm) {
        if (syn.length >= 6 && norm.includes(syn)) { hit = h; break; }
      }
      if (hit) break;
    }
    // Fallback: match in short body text as plain token.
    if (!hit) {
      for (const bt of shortBodyTexts) {
        const norm = normaliseHeading(bt);
        if (synonymsNorm.has(norm)) { hit = { index: -1, text: bt }; break; }
        for (const syn of synonymsNorm) {
          if (syn.length >= 6 && norm === syn) { hit = { index: -1, text: bt }; break; }
        }
        if (hit) break;
      }
    }
    // Keyword fallback: headings that contain core keywords even after
    // lorem-sanitisation (e.g. "СПИСОК ТРЕБОВАНИЕ ИСТОЧНИКОВ" — сохранено
    // "СПИСОК" + "ИСТОЧНИКОВ"). Prevents duplicate placeholders when the
    // real section exists but its middle word got lorem-replaced.
    if (!hit && section.canonical === "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ") {
      for (const h of headings) {
        if (consumed.has(h.index)) continue;
        const t = h.text.toUpperCase();
        if (/СПИСОК/.test(t) && /(ИСТОЧНИК|ЛИТЕРАТУР)/.test(t)) {
          hit = h;
          break;
        }
      }
      if (!hit) {
        for (const bt of shortBodyTexts) {
          const t = bt.toUpperCase();
          if (/СПИСОК/.test(t) && /(ИСТОЧНИК|ЛИТЕРАТУР)/.test(t)) {
            hit = { index: -1, text: bt };
            break;
          }
        }
      }
    }
    if (hit) {
      if (hit.index !== -1) consumed.add(hit.index);
      detections.push({ section, present: true, headingIndex: hit.index });
    } else {
      detections.push({ section, present: false });
    }
  }
  return detections;
}

/** Paragraphs whose plain text is short (≤ 80 chars) and contains no periods —
 *  heuristic for "heading-like" unstyled paragraphs. */
function collectShortBodyTexts(docXml: string): string[] {
  const out: string[] = [];
  const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  const textRunRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(docXml))) {
    const inner = m[1];
    let text = "";
    let tm: RegExpExecArray | null;
    textRunRe.lastIndex = 0;
    while ((tm = textRunRe.exec(inner))) text += decodeEntities(tm[1]);
    text = text.trim();
    if (!text || text.length > 80) continue;
    // Skip sentence-like paragraphs (contain period in the middle).
    if (/[.!?].{5}/.test(text)) continue;
    out.push(text);
  }
  return out;
}
