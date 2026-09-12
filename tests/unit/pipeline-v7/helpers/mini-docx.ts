/**
 * Builds the smallest .docx JSZip can produce: a content-types map, the main
 * document rels, and whatever parts a test asks for. Classification reads
 * styles.xml / numbering.xml / footnotes / headers through DocxPackage, so
 * tests need a real package, not a bare AST.
 */

import JSZip from "jszip";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";

export const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

const CT = "application/vnd.openxmlformats-officedocument.wordprocessingml";

export interface MiniDocxParts {
  /** Inner XML of w:body. */
  body: string;
  /** Inner XML of w:styles (w:style elements, w:docDefaults…). */
  styles?: string;
  /** Inner XML of w:numbering. */
  numbering?: string;
  /** Inner XML of w:footnotes. */
  footnotes?: string;
  /** Inner XML of w:hdr. */
  header?: string;
  /** Inner XML of w:settings. */
  settings?: string;
}

function overrides(parts: MiniDocxParts): string {
  const out = [
    `<Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/>`,
  ];
  if (parts.styles !== undefined) {
    out.push(`<Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/>`);
  }
  if (parts.numbering !== undefined) {
    out.push(`<Override PartName="/word/numbering.xml" ContentType="${CT}.numbering+xml"/>`);
  }
  if (parts.footnotes !== undefined) {
    out.push(`<Override PartName="/word/footnotes.xml" ContentType="${CT}.footnotes+xml"/>`);
  }
  if (parts.header !== undefined) {
    out.push(`<Override PartName="/word/header1.xml" ContentType="${CT}.header+xml"/>`);
  }
  if (parts.settings !== undefined) {
    out.push(`<Override PartName="/word/settings.xml" ContentType="${CT}.settings+xml"/>`);
  }
  return out.join("");
}

export async function buildMiniDocx(parts: MiniDocxParts): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `${overrides(parts)}</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
  );
  zip.file("word/document.xml", `<w:document ${W_NS}><w:body>${parts.body}</w:body></w:document>`);
  if (parts.styles !== undefined) {
    zip.file("word/styles.xml", `<w:styles ${W_NS}>${parts.styles}</w:styles>`);
  }
  if (parts.numbering !== undefined) {
    zip.file("word/numbering.xml", `<w:numbering ${W_NS}>${parts.numbering}</w:numbering>`);
  }
  if (parts.footnotes !== undefined) {
    zip.file("word/footnotes.xml", `<w:footnotes ${W_NS}>${parts.footnotes}</w:footnotes>`);
  }
  if (parts.header !== undefined) {
    zip.file("word/header1.xml", `<w:hdr ${W_NS}>${parts.header}</w:hdr>`);
  }
  if (parts.settings !== undefined) {
    zip.file("word/settings.xml", `<w:settings ${W_NS}>${parts.settings}</w:settings>`);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function miniPackage(parts: MiniDocxParts): Promise<DocxPackage> {
  return DocxPackage.load(await buildMiniDocx(parts));
}

/** <w:p> with optional pPr XML and a single run of `text`. */
export function p(text: string, pPr = "", rPr = ""): string {
  const run = text === "" ? "" : `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${run}</w:p>`;
}

export function style(id: string, name: string, extra = ""): string {
  return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;
}
