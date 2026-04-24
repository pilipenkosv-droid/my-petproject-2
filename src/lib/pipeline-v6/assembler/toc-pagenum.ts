// Two-pass TOC page-number resolver.
//
// After fixupToc injects a static TOC with "—" placeholders, this module
// does one extra headless LibreOffice render to PDF, locates each heading's
// first page via pdftotext, and rewrites the TOC entries with real page
// numbers.
//
// Cost: one additional soffice invocation per pipeline run (~1-1.5s).
// Graceful fallback: if soffice / pdftotext are missing, or matching fails
// for any heading, the "—" placeholder is kept.

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import JSZip from "jszip";

interface Heading {
  level: 1 | 2 | 3;
  text: string;
}

const STATIC_TOC_ENTRY_RE =
  /<w:p><w:pPr><w:pStyle w:val="(TOC[1-3])"\/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"\/><\/w:tabs>(?:<w:ind w:left="\d+"\/>)?<\/w:pPr><w:r><w:t xml:space="preserve">([^<]*)<\/w:t><\/w:r><w:r><w:tab\/><\/w:r><w:r><w:t>—<\/w:t><\/w:r><\/w:p>/g;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function convertToPdf(docxBuf: Buffer, tmpDir: string): string | null {
  const inPath = path.join(tmpDir, "in.docx");
  fs.writeFileSync(inPath, docxBuf);
  try {
    execSync(
      `soffice --headless --norestore --convert-to pdf "${inPath}" --outdir "${tmpDir}"`,
      { stdio: "pipe", timeout: 60000 },
    );
  } catch {
    return null;
  }
  const pdfPath = path.join(tmpDir, "in.pdf");
  if (!fs.existsSync(pdfPath)) return null;
  return pdfPath;
}

function pagesFromPdf(pdfPath: string): string[] {
  try {
    const out = execSync(`pdftotext -layout "${pdfPath}" -`, { stdio: ["ignore", "pipe", "pipe"] }).toString();
    return out.split("\f");
  } catch {
    return [];
  }
}

function normalizeMatch(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Returns 1-based page number where heading text first appears, or null. */
function findHeadingPage(heading: string, pages: string[]): number | null {
  const needle = normalizeMatch(heading);
  if (needle.length < 3) return null;
  const needleCompact = needle.length > 40 ? needle.slice(0, 40) : needle;
  // Skip page 1 (title) and 2 (TOC itself) when looking up — TOC text matches
  // would shadow the real heading on a body page.
  for (let i = 2; i < pages.length; i++) {
    const hay = normalizeMatch(pages[i]);
    if (hay.includes(needleCompact)) return i + 1;
  }
  return null;
}

/** Rewrites static TOC entries in docx to use real page numbers where found. */
export async function fillTocPageNumbers(docxBuf: Buffer): Promise<Buffer> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-toc-"));
  try {
    const pdfPath = convertToPdf(docxBuf, tmpDir);
    if (!pdfPath) return docxBuf;
    const pages = pagesFromPdf(pdfPath);
    if (pages.length === 0) return docxBuf;

    const zip = await JSZip.loadAsync(docxBuf);
    const docFile = zip.file("word/document.xml");
    if (!docFile) return docxBuf;
    const xml = await docFile.async("string");

    let filled = 0;
    let total = 0;
    const updated = xml.replace(STATIC_TOC_ENTRY_RE, (_m, style: string, textEsc: string) => {
      total++;
      const text = decodeXmlEntities(textEsc);
      const page = findHeadingPage(text, pages);
      if (page === null) {
        // Preserve the "—" placeholder if we couldn't find a page.
        return _m;
      }
      filled++;
      const indent = style === "TOC1" ? 0 : style === "TOC2" ? 220 : 440;
      return (
        `<w:p>` +
        `<w:pPr>` +
        `<w:pStyle w:val="${style}"/>` +
        `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs>` +
        (indent > 0 ? `<w:ind w:left="${indent}"/>` : "") +
        `</w:pPr>` +
        `<w:r><w:t xml:space="preserve">${textEsc}</w:t></w:r>` +
        `<w:r><w:tab/></w:r>` +
        `<w:r><w:t>${page}</w:t></w:r>` +
        `</w:p>`
      );
    });

    if (filled === 0) return docxBuf;
    zip.file("word/document.xml", updated);
    const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return out;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export type { Heading };
