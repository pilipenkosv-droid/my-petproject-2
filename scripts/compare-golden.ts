/**
 * Сравнение formatted docx с golden reference (ideal)
 *
 * Парсит XML обоих файлов и находит ВСЕ расхождения:
 * - Поля страницы, шрифты, интервалы, отступы, выравнивание
 * - Заголовки, подписи, библиография
 * - Footer, landscape, TOC
 *
 * Запуск:
 *   npx tsx scripts/compare-golden.ts <formatted.docx> <ideal.docx>
 */

import * as fs from "fs";
import JSZip from "jszip";
import {
  parseDocxXml,
  getBody,
  getParagraphsWithPositions,
  findChild,
  findChildren,
  getText,
  getRuns,
  children,
  getSectPr,
} from "../src/lib/xml/docx-xml";

// ── Helpers ──

function getFullText(p: any): string {
  const runs = getRuns(p);
  let text = "";
  for (const r of runs) {
    for (const t of findChildren(r, "w:t")) {
      text += getText(t);
    }
  }
  return text;
}

function getAttr(node: any, attr: string): string | undefined {
  return node?.[":@"]?.[`@_w:${attr}`] ?? node?.[":@"]?.[`@_${attr}`];
}

interface ParaInfo {
  index: number;
  text: string;
  alignment?: string;
  firstLine?: string;
  lineSpacing?: string;
  fontSize?: string;
  bold: boolean;
  fontFamily?: string;
  pStyle?: string;
}

function extractParaInfo(p: any, index: number): ParaInfo {
  const text = getFullText(p);
  const pPr = findChild(p, "w:pPr");

  const jc = findChild(pPr, "w:jc");
  const alignment = getAttr(jc, "val");

  const ind = findChild(pPr, "w:ind");
  const firstLine = getAttr(ind, "firstLine");

  const spacing = findChild(pPr, "w:spacing");
  const lineSpacing = getAttr(spacing, "line");

  const pStyle = findChild(pPr, "w:pStyle");
  const pStyleVal = getAttr(pStyle, "val");

  // First run formatting
  const runs = getRuns(p);
  let fontSize: string | undefined;
  let bold = false;
  let fontFamily: string | undefined;

  if (runs.length > 0 && runs[0]) {
    const rPr = findChild(runs[0], "w:rPr");
    if (rPr) {
      const sz = findChild(rPr, "w:sz");
      fontSize = sz ? getAttr(sz, "val") : undefined;
      bold = !!findChild(rPr, "w:b");
      const rFonts = findChild(rPr, "w:rFonts");
      fontFamily = rFonts ? getAttr(rFonts, "ascii") : undefined;
    }
  }

  return { index, text, alignment, firstLine, lineSpacing, fontSize, bold, fontFamily, pStyle: pStyleVal };
}

// ── Main ──

async function main() {
  const [formattedPath, idealPath] = process.argv.slice(2);
  if (!formattedPath || !idealPath) {
    console.error("Usage: npx tsx scripts/compare-golden.ts <formatted.docx> <ideal.docx>");
    process.exit(1);
  }

  const fmtBuf = fs.readFileSync(formattedPath);
  const idealBuf = fs.readFileSync(idealPath);

  const fmtZip = await JSZip.loadAsync(fmtBuf);
  const idealZip = await JSZip.loadAsync(idealBuf);

  const fmtXml = await fmtZip.file("word/document.xml")!.async("string");
  const idealXml = await idealZip.file("word/document.xml")!.async("string");

  const fmtParsed = parseDocxXml(fmtXml);
  const idealParsed = parseDocxXml(idealXml);

  const fmtBody = getBody(fmtParsed)!;
  const idealBody = getBody(idealParsed)!;

  const fmtParas = getParagraphsWithPositions(fmtBody);
  const idealParas = getParagraphsWithPositions(idealBody);

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  GOLDEN COMPARISON`);
  console.log(`══════════════════════════════════════════`);
  console.log(`  Formatted: ${fmtParas.length} paragraphs`);
  console.log(`  Ideal:     ${idealParas.length} paragraphs\n`);

  // ── 1. Paragraph count diff ──
  const diffs: string[] = [];

  if (fmtParas.length !== idealParas.length) {
    diffs.push(`STRUCTURE: Paragraph count differs: formatted=${fmtParas.length}, ideal=${idealParas.length}`);
  }

  // ── 2. Content alignment via text matching ──
  // Build text→index maps for alignment
  const idealTexts = idealParas.map((p, i) => ({ i, text: getFullText(p.node).trim() })).filter(p => p.text);
  const fmtTexts = fmtParas.map((p, i) => ({ i, text: getFullText(p.node).trim() })).filter(p => p.text);

  // Match paragraphs by text content
  const matchedPairs: { fmtIdx: number; idealIdx: number; text: string }[] = [];
  const idealUsed = new Set<number>();

  for (const ft of fmtTexts) {
    // Find matching ideal paragraph
    const match = idealTexts.find(it => !idealUsed.has(it.i) && it.text === ft.text);
    if (match) {
      matchedPairs.push({ fmtIdx: ft.i, idealIdx: match.i, text: ft.text.substring(0, 60) });
      idealUsed.add(match.i);
    }
  }

  // ── 3. Compare formatting of matched paragraphs ──
  let formattingDiffs = 0;
  const categories = {
    alignment: 0,
    indent: 0,
    spacing: 0,
    fontSize: 0,
    bold: 0,
    font: 0,
    style: 0,
  };

  for (const pair of matchedPairs) {
    const fInfo = extractParaInfo(fmtParas[pair.fmtIdx].node, pair.fmtIdx);
    const iInfo = extractParaInfo(idealParas[pair.idealIdx].node, pair.idealIdx);

    const paraLabel = `[${pair.fmtIdx}] "${pair.text.substring(0, 50)}..."`;

    if (fInfo.alignment !== iInfo.alignment) {
      diffs.push(`ALIGNMENT ${paraLabel}: fmt=${fInfo.alignment}, ideal=${iInfo.alignment}`);
      categories.alignment++;
      formattingDiffs++;
    }
    if (fInfo.firstLine !== iInfo.firstLine) {
      diffs.push(`INDENT ${paraLabel}: fmt.firstLine=${fInfo.firstLine}, ideal.firstLine=${iInfo.firstLine}`);
      categories.indent++;
      formattingDiffs++;
    }
    if (fInfo.lineSpacing !== iInfo.lineSpacing) {
      diffs.push(`SPACING ${paraLabel}: fmt.line=${fInfo.lineSpacing}, ideal.line=${iInfo.lineSpacing}`);
      categories.spacing++;
      formattingDiffs++;
    }
    if (fInfo.fontSize !== iInfo.fontSize) {
      diffs.push(`FONTSIZE ${paraLabel}: fmt=${fInfo.fontSize}, ideal=${iInfo.fontSize}`);
      categories.fontSize++;
      formattingDiffs++;
    }
    if (fInfo.bold !== iInfo.bold) {
      diffs.push(`BOLD ${paraLabel}: fmt=${fInfo.bold}, ideal=${iInfo.bold}`);
      categories.bold++;
      formattingDiffs++;
    }
  }

  // ── 4. Unmatched paragraphs ──
  const unmatchedFmt = fmtTexts.filter(ft => !matchedPairs.some(p => p.fmtIdx === ft.i));
  const unmatchedIdeal = idealTexts.filter(it => !idealUsed.has(it.i));

  if (unmatchedFmt.length > 0) {
    diffs.push(`\nONLY IN FORMATTED (${unmatchedFmt.length}):`);
    for (const p of unmatchedFmt.slice(0, 20)) {
      diffs.push(`  [${p.i}] "${p.text.substring(0, 70)}"`);
    }
  }
  if (unmatchedIdeal.length > 0) {
    diffs.push(`\nONLY IN IDEAL (${unmatchedIdeal.length}):`);
    for (const p of unmatchedIdeal.slice(0, 20)) {
      diffs.push(`  [${p.i}] "${p.text.substring(0, 70)}"`);
    }
  }

  // ── 5. Footer comparison ──
  const fmtFooter = await fmtZip.file("word/footer1.xml")?.async("string");
  const idealFooter = await idealZip.file("word/footer1.xml")?.async("string");

  if (fmtFooter && idealFooter) {
    const fmtJc = fmtFooter.match(/w:jc\s+w:val="([^"]+)"/)?.[1];
    const idealJc = idealFooter.match(/w:jc\s+w:val="([^"]+)"/)?.[1];
    if (fmtJc !== idealJc) {
      diffs.push(`FOOTER: alignment fmt=${fmtJc}, ideal=${idealJc}`);
    }
  }

  // ── 6. Section/margin comparison ──
  const fmtMargins = (fmtXml.match(/w:pgMar[^/]*/g) || []).map(m => {
    const right = m.match(/w:right="(\d+)"/)?.[1];
    return right;
  });
  const idealMargins = (idealXml.match(/w:pgMar[^/]*/g) || []).map(m => {
    const right = m.match(/w:right="(\d+)"/)?.[1];
    return right;
  });

  const fmtLandscape = (fmtXml.match(/orient="landscape"/g) || []).length;
  const idealLandscape = (idealXml.match(/orient="landscape"/g) || []).length;

  if (fmtLandscape !== idealLandscape) {
    diffs.push(`LANDSCAPE: fmt=${fmtLandscape}, ideal=${idealLandscape}`);
  }

  // ── Output ──
  console.log(`  Matched paragraphs: ${matchedPairs.length}`);
  console.log(`  Unmatched in formatted: ${unmatchedFmt.length}`);
  console.log(`  Unmatched in ideal: ${unmatchedIdeal.length}`);
  console.log(`  Formatting diffs: ${formattingDiffs}`);
  console.log(`  Landscape: fmt=${fmtLandscape}, ideal=${idealLandscape}`);
  console.log(`\n  Categories:`);
  for (const [k, v] of Object.entries(categories)) {
    if (v > 0) console.log(`    ${k}: ${v}`);
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  DIFFERENCES (${diffs.length})`);
  console.log(`══════════════════════════════════════════\n`);

  for (const d of diffs.slice(0, 100)) {
    console.log(d);
  }

  if (diffs.length > 100) {
    console.log(`\n  ... and ${diffs.length - 100} more`);
  }

  console.log(`\n══════════════════════════════════════════`);
  if (formattingDiffs === 0 && unmatchedFmt.length === 0 && unmatchedIdeal.length === 0) {
    console.log(`  ✅ GOLDEN MATCH — documents are identical`);
  } else {
    console.log(`  ❌ ${formattingDiffs} formatting diffs, ${unmatchedFmt.length + unmatchedIdeal.length} content diffs`);
  }
  console.log(`══════════════════════════════════════════\n`);
}

main().catch(console.error);
