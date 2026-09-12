/**
 * Hand-built minimal .docx packages for fingerprint and gate tests.
 *
 * Separate from helpers/mini-docx.ts, which serves the classifier tests: the
 * fingerprint needs footers, several headers, media files and a populated
 * document.xml.rels, none of which that helper builds.
 *
 * Small enough to read at a glance, complete enough for DocxPackage:
 * [Content_Types].xml overrides drive part discovery, so headers, footers and
 * footnotes appear in contentParts() exactly as they do in a real document.
 */

import JSZip from "jszip";

export const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
].join(" ");

const CT = "application/vnd.openxmlformats-officedocument.wordprocessingml";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export interface MiniDocxSpec {
  /** Block-level XML of w:body, w:sectPr included. */
  body: string;
  /** Inner XML of w:footnotes. */
  footnotes?: string;
  /** "header1.xml" -> inner XML of w:hdr. */
  headers?: Record<string, string>;
  /** "footer1.xml" -> inner XML of w:ftr. */
  footers?: Record<string, string>;
  /** "image1.png" -> file bytes. */
  media?: Record<string, string>;
}

interface Part {
  name: string;
  content: string;
  contentType?: string;
  relType?: string;
}

function collect(spec: MiniDocxSpec): Part[] {
  const parts: Part[] = [];
  if (spec.footnotes !== undefined) {
    parts.push({
      name: "footnotes.xml",
      content: `${DECL}<w:footnotes ${NS}>${spec.footnotes}</w:footnotes>`,
      contentType: `${CT}.footnotes+xml`,
      relType: "footnotes",
    });
  }
  for (const [name, inner] of Object.entries(spec.headers ?? {})) {
    parts.push({ name, content: `${DECL}<w:hdr ${NS}>${inner}</w:hdr>`, contentType: `${CT}.header+xml`, relType: "header" });
  }
  for (const [name, inner] of Object.entries(spec.footers ?? {})) {
    parts.push({ name, content: `${DECL}<w:ftr ${NS}>${inner}</w:ftr>`, contentType: `${CT}.footer+xml`, relType: "footer" });
  }
  for (const [name, bytes] of Object.entries(spec.media ?? {})) {
    parts.push({ name: `media/${name}`, content: bytes, relType: "image" });
  }
  return parts;
}

function contentTypes(parts: Part[]): string {
  const overrides = parts
    .filter((p) => p.contentType)
    .map((p) => `<Override PartName="/word/${p.name}" ContentType="${p.contentType}"/>`)
    .join("");
  return `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/>${overrides}</Types>`;
}

function documentRels(parts: Part[]): string {
  const rels = parts
    .map((p, i) => `<Relationship Id="rId${i + 10}" Type="${REL}/${p.relType}" Target="${p.name}"/>`)
    .join("");
  return `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

export async function buildDocx(spec: MiniDocxSpec): Promise<Buffer> {
  const parts = collect(spec);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes(parts));
  zip.file(
    "_rels/.rels",
    `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file("word/document.xml", `${DECL}<w:document ${NS}><w:body>${spec.body}</w:body></w:document>`);
  zip.file("word/_rels/document.xml.rels", documentRels(parts));
  for (const part of parts) zip.file(`word/${part.name}`, part.content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** A paragraph with a single text run. */
export const p = (text: string, style?: string): string =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;

/** A complex field: begin / instrText / separate / result / end. */
export const field = (instr: string, result = "1"): string =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${result}</w:t></w:r>` +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

export const sectPr = (extra = ""): string =>
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/>${extra}</w:sectPr>`;
