/**
 * Post-pass enforcer: final structural formatting step.
 *
 * Runs LAST in the pipeline (after TOC / landscape / caption-numbering),
 * re-reads the XML and enforces invariants that earlier passes may have
 * dropped or that the original applyFormattingToParagraph missed because
 * it only walks top-level body paragraphs.
 *
 * Fixes:
 * 1. heading_1 paragraphs always have w:pageBreakBefore + center + bold
 *    (identified by w:pStyle="Heading1")
 * 2. body_text paragraphs always have w:jc val="both"
 *    (identified via text lookup into enrichedParagraphs)
 * 3. Multi-space runs (including NBSP sequences) are collapsed inside w:t
 */
import JSZip from "jszip";
import type { DocxParagraph } from "../pipeline/document-analyzer";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  findChild,
  findChildren,
  children,
  getRuns,
  getRunText,
  ensurePPr,
  ensureRPr,
  setOrderedProp,
  createNode,
} from "../xml/docx-xml";

interface Stats {
  h1Fixed: number;
  alignmentFixed: number;
  spacesFixed: number;
}

function paragraphText(p: OrderedXmlNode): string {
  let text = "";
  for (const run of getRuns(p)) text += getRunText(run);
  return text;
}

function enforceH1(p: OrderedXmlNode, stats: Stats): void {
  const pPr = findChild(p, "w:pPr");
  if (!pPr) return;
  const pStyle = findChild(pPr, "w:pStyle");
  const styleVal = pStyle?.[":@"]?.["@_w:val"];
  if (styleVal !== "Heading1") return;

  let changed = false;

  if (!findChild(pPr, "w:pageBreakBefore")) {
    children(pPr).push(createNode("w:pageBreakBefore"));
    changed = true;
  }

  const jc = findChild(pPr, "w:jc");
  const jcVal = jc?.[":@"]?.["@_w:val"];
  if (jcVal !== "center") {
    setOrderedProp(pPr, "w:jc", { "w:val": "center" });
    changed = true;
  }

  for (const run of getRuns(p)) {
    const rPr = ensureRPr(run);
    if (!findChild(rPr, "w:b")) {
      children(rPr).push(createNode("w:b"));
      changed = true;
    }
    if (!findChild(rPr, "w:bCs")) {
      children(rPr).push(createNode("w:bCs"));
    }
  }

  if (changed) stats.h1Fixed++;
}

function enforceBodyTextAlignment(p: OrderedXmlNode, stats: Stats): void {
  const pPr = ensurePPr(p);
  const jc = findChild(pPr, "w:jc");
  const cur = jc?.[":@"]?.["@_w:val"];
  if (cur === "both") return;
  setOrderedProp(pPr, "w:jc", { "w:val": "both" });
  stats.alignmentFixed++;
}

/**
 * Collapse runs of whitespace/NBSP of length >=2 inside a w:t text node.
 * NBSP sequences and mixed NBSP+space get normalized to a single space.
 */
function collapseWhitespaceInParagraph(p: OrderedXmlNode, stats: Stats): void {
  let changedAny = false;
  const textNodes: OrderedXmlNode[] = [];
  for (const run of getRuns(p)) {
    for (const ch of children(run)) {
      if (!("w:t" in ch)) continue;
      for (const tc of children(ch)) {
        if ("#text" in tc && typeof tc["#text"] === "string") {
          const orig = tc["#text"];
          const next = orig.replace(/[ \u00A0]{2,}/g, " ");
          if (next !== orig) {
            tc["#text"] = next;
            changedAny = true;
          }
          textNodes.push(tc);
        }
      }
    }
  }
  // Cross-run boundary: prev ends with space + next starts with space → strip leading
  for (let i = 1; i < textNodes.length; i++) {
    const prev = textNodes[i - 1]["#text"] as string;
    const curr = textNodes[i]["#text"] as string;
    if (/[ \u00A0]$/.test(prev) && /^[ \u00A0]/.test(curr)) {
      textNodes[i]["#text"] = curr.replace(/^[ \u00A0]+/, "");
      changedAny = true;
    }
  }
  if (changedAny) stats.spacesFixed++;
}

/**
 * Build a lookup map: paragraph text prefix → blockType.
 * Mirrors the fuzzy text-based matching used by quality-checks.ts
 * so we classify paragraphs the same way the bench does.
 */
function buildBlockTypeLookup(enrichedParagraphs: DocxParagraph[]): {
  byIndex: Map<number, DocxParagraph>;
  byText: Map<string, DocxParagraph>;
  byCleanText: Map<string, DocxParagraph>;
} {
  const byIndex = new Map<number, DocxParagraph>();
  const byText = new Map<string, DocxParagraph>();
  const byCleanText = new Map<string, DocxParagraph>();
  for (const p of enrichedParagraphs) {
    byIndex.set(p.index, p);
    const key = (p.text || "").trim().substring(0, 80);
    if (key && !byText.has(key)) byText.set(key, p);
    const cleanKey = (p.text || "")
      .trim()
      .replace(/^\d[\d.]*\s*/, "")
      .substring(0, 80);
    if (cleanKey && !byCleanText.has(cleanKey)) byCleanText.set(cleanKey, p);
  }
  return { byIndex, byText, byCleanText };
}

function lookupBlockType(
  paragraphIndex: number,
  text: string,
  maps: ReturnType<typeof buildBlockTypeLookup>
): string | undefined {
  const byIndex = maps.byIndex.get(paragraphIndex);
  if (byIndex) {
    const origText = (byIndex.text || "").trim().substring(0, 40);
    const fmtText = text.trim().replace(/^\d[\d.]*\s*/, "").substring(0, 40);
    if (
      !origText ||
      !fmtText ||
      origText === fmtText ||
      origText.startsWith(fmtText.substring(0, 20)) ||
      fmtText.startsWith(origText.substring(0, 20))
    ) {
      return byIndex.blockType;
    }
  }
  const key = text.trim().substring(0, 80);
  if (key) {
    const byText = maps.byText.get(key);
    if (byText) return byText.blockType;
    const cleanKey = text.trim().replace(/^\d[\d.]*\s*/, "").substring(0, 80);
    if (cleanKey) {
      const byClean = maps.byCleanText.get(cleanKey);
      if (byClean) return byClean.blockType;
    }
  }
  return undefined;
}

/**
 * Walk every w:p in the document (including inside w:tbl > w:tr > w:tc).
 * Callback receives (node, topLevelIndex). topLevelIndex is -1 for nested paragraphs.
 */
function walkAllParagraphs(
  body: OrderedXmlNode,
  cb: (p: OrderedXmlNode, topLevelIndex: number) => void
): void {
  let topIndex = 0;
  const walk = (container: OrderedXmlNode, atTop: boolean): void => {
    for (const node of children(container)) {
      if ("w:p" in node) {
        cb(node, atTop ? topIndex++ : -1);
      } else if ("w:tbl" in node) {
        const rows = findChildren(node, "w:tr");
        for (const row of rows) {
          const cells = findChildren(row, "w:tc");
          for (const cell of cells) {
            walk(cell, false);
          }
        }
      }
    }
  };
  walk(body, true);
}

export async function enforceStructuralFormatting(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[]
): Promise<{ buffer: Buffer; stats: Stats }> {
  const stats: Stats = { h1Fixed: 0, alignmentFixed: 0, spacesFixed: 0 };

  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return { buffer, stats };

  const parsed = parseDocxXml(xml);
  const body = getBody(parsed);
  if (!body) return { buffer, stats };

  const maps = buildBlockTypeLookup(enrichedParagraphs);

  walkAllParagraphs(body, (p, topLevelIndex) => {
    // Always enforce H1 + collapse whitespace regardless of nesting
    enforceH1(p, stats);
    collapseWhitespaceInParagraph(p, stats);

    // body_text alignment: only top-level paragraphs have a blockType in
    // enrichedParagraphs; cell paragraphs are handled by table-cells-formatter.
    if (topLevelIndex >= 0) {
      const text = paragraphText(p);
      const blockType = lookupBlockType(topLevelIndex, text, maps);
      if (blockType === "body_text" || blockType === "quote") {
        enforceBodyTextAlignment(p, stats);
      }
    }
  });

  if (stats.h1Fixed === 0 && stats.alignmentFixed === 0 && stats.spacesFixed === 0) {
    return { buffer, stats };
  }

  zip.file("word/document.xml", buildDocxXml(parsed));
  const out = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;

  console.log(
    `[post-pass] h1Fixed=${stats.h1Fixed} alignmentFixed=${stats.alignmentFixed} spacesFixed=${stats.spacesFixed}`
  );

  return { buffer: out, stats };
}
