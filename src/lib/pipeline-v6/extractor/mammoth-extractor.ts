// Extractor — docx → Markdown + structured asset JSON.
// Uses mammoth.js for markdown conversion, JSZip for raw assets (images, tables).
//
// Output shape:
//   { markdown: string,     // body text with heading levels preserved
//     assets: {
//       images: { filename, mimeType, base64, widthEmu?, heightEmu? }[],
//       tables: { rows: string[][], hasMergedCells: boolean, id: string }[],
//     },
//     warnings: string[],    // mammoth conversion warnings
//     statistics: { h1Count, h2Count, paragraphs, words }
//   }
//
// Body Rewriter and Assembler consume markdown; Assembler also uses assets.

import mammothDefault from "mammoth";
import JSZip from "jszip";

// mammoth types lag runtime: convertToMarkdown exists at runtime but is absent
// from @types/mammoth. Narrow the shape here to keep the rest of the file typed.
// mammoth.images.imgElement lets us replace inline base64 images with a lightweight
// markdown placeholder. Without this, a 600 KB docx with embedded images can balloon
// to 50+ MB of markdown (base64 data URIs), making downstream slotting+LLM unusable.
interface MammothImageElement {
  read(encoding: string): Promise<string>;
  contentType: string;
}
interface MammothImages {
  imgElement(handler: (img: MammothImageElement) => Promise<{ src: string; alt?: string }>): unknown;
}
const mammoth = mammothDefault as unknown as {
  convertToMarkdown(input: { buffer: Buffer }, options?: { convertImage?: unknown }): Promise<{
    value: string;
    messages: { type: string; message: string }[];
  }>;
  images: MammothImages;
};

let imageIdx = 0;
const imagePlaceholder = mammoth.images.imgElement(async () => {
  imageIdx += 1;
  return { src: `image-${imageIdx}.bin`, alt: "image" };
});

export interface ExtractedImage {
  filename: string;
  mimeType: string;
  base64: string;
}

export interface ExtractedTable {
  id: string;
  rows: string[][];
  hasMergedCells: boolean;
  columnCount: number;
}

export interface ExtractionStatistics {
  h1Count: number;
  h2Count: number;
  h3Count: number;
  paragraphs: number;
  words: number;
  formulas: number;
}

export interface ExtractedDocument {
  markdown: string;
  assets: {
    images: ExtractedImage[];
    tables: ExtractedTable[];
  };
  warnings: string[];
  statistics: ExtractionStatistics;
}

async function extractImages(zip: JSZip): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  const mediaFiles = Object.keys(zip.files).filter(
    (f) => f.startsWith("word/media/") && /\.(png|jpg|jpeg|gif|bmp)$/i.test(f),
  );
  for (const filename of mediaFiles) {
    const file = zip.file(filename);
    if (!file) continue;
    const buf = await file.async("nodebuffer");
    const ext = filename.split(".").pop()!.toLowerCase();
    const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    images.push({
      filename: filename.replace("word/media/", ""),
      mimeType,
      base64: buf.toString("base64"),
    });
  }
  return images;
}

function extractTablesFromXml(xml: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = tblRegex.exec(xml))) {
    const tblXml = match[0];
    const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
    const rows: string[][] = [];
    let colCount = 0;
    let merged = false;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tblXml))) {
      const trXml = rowMatch[0];
      if (/<w:vMerge\b/.test(trXml)) merged = true;
      const cellRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(trXml))) {
        const tcXml = cellMatch[0];
        if (/<w:gridSpan\b/.test(tcXml)) merged = true;
        const text = [...tcXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
          .map((m) => m[1])
          .join("")
          .trim();
        cells.push(text);
      }
      colCount = Math.max(colCount, cells.length);
      rows.push(cells);
    }
    tables.push({
      id: `table-${idx++}`,
      rows,
      hasMergedCells: merged,
      columnCount: colCount,
    });
  }
  return tables;
}

function countFormulas(xml: string): number {
  return (xml.match(/<m:oMath\b/g) ?? []).length;
}

function computeStatistics(markdown: string, formulaCount: number): ExtractionStatistics {
  const lines = markdown.split("\n");
  const h1Count = lines.filter((l) => /^#\s/.test(l)).length;
  const h2Count = lines.filter((l) => /^##\s/.test(l)).length;
  const h3Count = lines.filter((l) => /^###\s/.test(l)).length;
  const paragraphs = lines.filter((l) => l.trim().length > 0).length;
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return { h1Count, h2Count, h3Count, paragraphs, words, formulas: formulaCount };
}

export async function extractDocument(buffer: Buffer): Promise<ExtractedDocument> {
  imageIdx = 0;
  const mammothResult = await mammoth.convertToMarkdown(
    { buffer },
    { convertImage: imagePlaceholder },
  );
  const markdown = mammothResult.value;
  const warnings = mammothResult.messages.map((m) => `${m.type}: ${m.message}`);

  const zip = await JSZip.loadAsync(buffer);
  const images = await extractImages(zip);
  const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const tables = extractTablesFromXml(docXml);
  const formulas = countFormulas(docXml);

  return {
    markdown,
    assets: { images, tables },
    warnings,
    statistics: computeStatistics(markdown, formulas),
  };
}
