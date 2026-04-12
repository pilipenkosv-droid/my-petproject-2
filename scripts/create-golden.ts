/**
 * Создание golden reference из ideal документа
 *
 * Берёт _ideal.docx (частично доработанный вручную) и программно
 * исправляет все оставшиеся ГОСТ-проблемы.
 *
 * Запуск: npx tsx scripts/create-golden.ts
 */

import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  getParagraphsWithPositions,
  findChild,
  findChildren,
  getText,
  getRuns,
  children,
  ensurePPr,
  ensureRPr,
  setOrderedProp,
  removeChild,
  createNode,
  createTextNode,
} from "../src/lib/xml/docx-xml";

const NBSP = "\u00A0";

const INPUT = "scripts/test-output/prqZG08LGNO58ld0s_Aj_ideal.docx";
const OUTPUT = "scripts/test-output/prqZG08LGNO58ld0s_Aj_golden.docx";

// ── Helpers ──

function getFullText(p: OrderedXmlNode): string {
  const runs = getRuns(p);
  let text = "";
  for (const r of runs) {
    for (const t of findChildren(r, "w:t")) {
      text += getText(t);
    }
  }
  return text;
}

function getPStyle(p: OrderedXmlNode): string | undefined {
  const pPr = findChild(p, "w:pPr");
  const pStyle = pPr ? findChild(pPr, "w:pStyle") : undefined;
  return pStyle?.[":@"]?.["@_w:val"] as string | undefined;
}

function isHeading(p: OrderedXmlNode): boolean {
  const style = getPStyle(p);
  return !!style && /^Heading\d$/i.test(style);
}

/** Переписывает весь текст параграфа (собирает из runs, трансформирует, записывает в первый w:t) */
function rewriteText(p: OrderedXmlNode, transform: (text: string) => string): boolean {
  const runs = getRuns(p);
  if (runs.length === 0) return false;

  let fullText = "";
  for (const run of runs) {
    for (const tNode of findChildren(run, "w:t")) {
      fullText += getText(tNode);
    }
  }
  if (!fullText) return false;

  const newText = transform(fullText);
  if (newText === fullText) return false;

  let written = false;
  for (const run of runs) {
    const runCh = children(run);
    for (let i = 0; i < runCh.length; i++) {
      if (!("w:t" in runCh[i])) continue;
      if (!written) {
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(newText),
        ]);
        written = true;
      } else {
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(""),
        ]);
      }
    }
  }
  return true;
}

// ── Fix 1: NBSP in initials ──

function fixNBSP(text: string): string {
  // Между инициалами: И. О. → И.\u00A0О.
  text = text.replace(/([А-ЯЁ])\.\s+([А-ЯЁ])\./g, `$1.${NBSP}$2.`);
  // Инициал + Фамилия: О. Иванов → О.\u00A0Иванов
  text = text.replace(/([А-ЯЁ])\.\s+([А-ЯЁ][а-яё]{2,})/g, `$1.${NBSP}$2`);
  // Фамилия + Инициал: Иванов И. → Иванов\u00A0И.
  text = text.replace(/([А-ЯЁ][а-яё]{1,})\s+([А-ЯЁ]\.)/g, `$1${NBSP}$2`);
  // Английские
  text = text.replace(/([A-Z])\.\s+([A-Z])\./g, `$1.${NBSP}$2.`);
  text = text.replace(/([A-Z])\.\s+([A-Z][a-z]{2,})/g, `$1.${NBSP}$2`);
  // Множественные пробелы → один
  text = text.replace(/ {2,}/g, " ");
  return text;
}

// ── Fix 2: Strip trailing dots from headings ──

function stripHeadingDot(text: string): string {
  // Убираем . : в конце заголовков
  return text.replace(/[.:]+\s*$/, "").trim();
}

// ── Main ──

async function main() {
  console.log("Loading ideal document...");
  const buf = fs.readFileSync(INPUT);
  const zip = await JSZip.loadAsync(buf);

  const docXml = await zip.file("word/document.xml")!.async("string");
  const parsed = parseDocxXml(docXml);
  const body = getBody(parsed)!;
  const bodyNodes = children(body);

  let fixes = 0;

  // ════════════════════════════════════════
  // Fix 1: NBSP in initials (all paragraphs)
  // ════════════════════════════════════════
  console.log("\n[1/7] NBSP in initials...");
  let nbspFixes = 0;
  for (const node of bodyNodes) {
    if ("w:p" in node) {
      if (rewriteText(node, fixNBSP)) nbspFixes++;
    }
    // Also fix inside table cells
    if ("w:tbl" in node) {
      const rows = findChildren(node, "w:tr");
      for (const row of rows) {
        const cells = findChildren(row, "w:tc");
        for (const cell of cells) {
          const paras = findChildren(cell, "w:p");
          for (const p of paras) {
            if (rewriteText(p, fixNBSP)) nbspFixes++;
          }
        }
      }
    }
  }
  console.log(`  Fixed ${nbspFixes} paragraphs`);
  fixes += nbspFixes;

  // ════════════════════════════════════════
  // Fix 2: Strip trailing dots from headings
  // ════════════════════════════════════════
  console.log("\n[2/7] Heading dots...");
  let dotFixes = 0;
  for (const node of bodyNodes) {
    if (!("w:p" in node)) continue;
    if (!isHeading(node)) continue;
    if (rewriteText(node, stripHeadingDot)) {
      const text = getFullText(node).substring(0, 60);
      console.log(`  Stripped dot: "${text}"`);
      dotFixes++;
    }
  }
  console.log(`  Fixed ${dotFixes} headings`);
  fixes += dotFixes;

  // ════════════════════════════════════════
  // Fix 3: Merge split headings
  // ════════════════════════════════════════
  console.log("\n[3/7] Merge split headings...");
  let mergeFixes = 0;

  // Known split headings from analysis:
  // Para 252 (Heading1): "2 Изучение особенностей словесно-"
  // Para 253 (Heading1): "3 логического мышления детей с ОНР"
  // → Should be: "2 Изучение особенностей словесно-логического мышления детей с ОНР"
  //
  // Para 254 (Heading2): "3.1 Методика констатирующего"
  // Para 255 (Heading2): "3.2 эксперимента"
  // → Should be: "2.1 Методика констатирующего эксперимента"
  //
  // Para 86 (Heading1): "1 Анализ общей и специальной литературы по проблеме"
  // Para 87-88 (Normal): continuation text
  // → Should merge into heading

  // Hard-coded fix: Chapter 1 heading + continuation paras 87-88
  // "1 Анализ общей и специальной литературы по проблеме" +
  // "исследования словесно-логического мышления у" +
  // "старших дошкольников с ОНР. НЕ сокращаем"
  // → merge all into one heading, remove "НЕ сокращаем" comment
  for (let i = 0; i < bodyNodes.length - 2; i++) {
    if (!("w:p" in bodyNodes[i])) continue;
    const t = getFullText(bodyNodes[i]).trim();
    if (t.includes("Анализ общей и специальной литературы по проблеме") && isHeading(bodyNodes[i])) {
      // Check next 1-2 paras for continuation
      const parts = [t];
      let removeCount = 0;
      for (let j = 1; j <= 2; j++) {
        if (i + j >= bodyNodes.length || !("w:p" in bodyNodes[i + j])) break;
        const nextT = getFullText(bodyNodes[i + j]).trim();
        if (!nextT || isHeading(bodyNodes[i + j])) break;
        // Remove "НЕ сокращаем" note
        const clean = nextT.replace(/\s*НЕ сокращаем\s*/gi, "").replace(/\.\s*$/, "");
        if (clean) parts.push(clean);
        removeCount++;
      }
      if (removeCount > 0) {
        const merged = parts.join(" исследования словесно-логического мышления у старших дошкольников с ОНР".includes(parts.join(" ")) ? "" : " ");
        rewriteText(bodyNodes[i], () => "1 Анализ общей и специальной литературы по проблеме исследования словесно-логического мышления у старших дошкольников с ОНР");
        for (let j = removeCount; j >= 1; j--) {
          bodyNodes.splice(i + j, 1);
        }
        console.log(`  Merged Chapter 1 heading with ${removeCount} continuations`);
        mergeFixes++;
      }
      break;
    }
  }

  // Hard-coded fix: "3.1 Методика констатирующего" + "3.2 эксперимента"
  // → "2.1 Методика констатирующего эксперимента"
  for (let i = 0; i < bodyNodes.length - 1; i++) {
    if (!("w:p" in bodyNodes[i])) continue;
    const t = getFullText(bodyNodes[i]).trim();
    if (t.includes("Методика констатирующего") && isHeading(bodyNodes[i])) {
      const nextT = ("w:p" in bodyNodes[i + 1]) ? getFullText(bodyNodes[i + 1]).trim() : "";
      if (nextT.includes("эксперимента")) {
        rewriteText(bodyNodes[i], () => "2.1 Методика констатирующего эксперимента");
        bodyNodes.splice(i + 1, 1);
        console.log(`  Merged "Методика констатирующего" + "эксперимента"`);
        mergeFixes++;
      }
      break;
    }
  }

  // Generic merge: find consecutive Heading paragraphs where the second starts
  // with what looks like a continuation (lowercase, or numbered wrongly)
  for (let i = bodyNodes.length - 2; i >= 0; i--) {
    const curr = bodyNodes[i];
    const next = bodyNodes[i + 1];
    if (!("w:p" in curr) || !("w:p" in next)) continue;
    if (!isHeading(curr)) continue;

    const currText = getFullText(curr).trim();
    const nextText = getFullText(next).trim();
    if (!currText || !nextText) continue;

    // Case 1: Two consecutive headings that are really one split heading
    // The second heading starts with a number that's wrong in sequence
    // (e.g., "3 логического" when prev was "2 Изучение")
    if (isHeading(next)) {
      // Check if current ends with hyphen (word split)
      if (currText.endsWith("-")) {
        // Merge: remove leading number from next
        const nextClean = nextText.replace(/^\d+(?:\.\d+)*\s+/, "");
        rewriteText(curr, () => currText + nextClean);
        // Remove trailing dot from merged result
        rewriteText(curr, stripHeadingDot);
        bodyNodes.splice(i + 1, 1);
        console.log(`  Merged split heading: "${getFullText(curr).substring(0, 60)}..."`);
        mergeFixes++;
        continue;
      }
    }

    // Case 2: Heading followed by Normal paragraph that's a continuation
    // Only merge when heading CLEARLY ends mid-word/mid-phrase (e.g., ends with hyphen
    // or the combined text is still short enough to be a heading title)
    if (!isHeading(next)) {
      const nextStyle = getPStyle(next);
      if (nextStyle && /^Heading/i.test(nextStyle)) continue;

      // Only merge if heading ends with hyphen (word split) — strongest signal
      if (!currText.endsWith("-")) continue;

      if (nextText.length > 120) continue;

      // Merge hyphen-split heading
      const nextClean = nextText.replace(/^\d+(?:\.\d+)*\s+/, "");
      rewriteText(curr, () => currText + nextClean);
      rewriteText(curr, stripHeadingDot);
      bodyNodes.splice(i + 1, 1);
      console.log(`  Merged continuation: "${getFullText(curr).substring(0, 60)}..."`);
      mergeFixes++;
    }
  }
  console.log(`  Merged ${mergeFixes} headings`);
  fixes += mergeFixes;

  // ════════════════════════════════════════
  // Fix 4: Remove excessive empty paragraphs
  // ════════════════════════════════════════
  console.log("\n[4/7] Empty paragraph cleanup...");
  let emptyFixes = 0;
  let consecutive = 0;
  const toRemove: number[] = [];

  for (let i = 0; i < bodyNodes.length; i++) {
    if (!("w:p" in bodyNodes[i])) {
      consecutive = 0;
      continue;
    }
    const text = getFullText(bodyNodes[i]).trim();
    if (text === "") {
      consecutive++;
      // Allow max 2 consecutive empty paragraphs (before title page footer area, allow more)
      if (consecutive > 2) {
        // Don't remove if in title page area (first 35 paragraphs)
        if (i > 35) {
          toRemove.push(i);
        }
      }
    } else {
      consecutive = 0;
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    bodyNodes.splice(toRemove[i], 1);
    emptyFixes++;
  }
  console.log(`  Removed ${emptyFixes} excess empty paragraphs`);
  fixes += emptyFixes;

  // ════════════════════════════════════════
  // Fix 5: Table-level shading removal
  // ════════════════════════════════════════
  console.log("\n[5/7] Remove table/paragraph shading...");
  let shadingFixes = 0;
  for (const node of bodyNodes) {
    // Table-level shading
    if ("w:tbl" in node) {
      const tblPr = findChild(node, "w:tblPr");
      if (tblPr && findChild(tblPr, "w:shd")) {
        removeChild(tblPr, "w:shd");
        shadingFixes++;
      }
      // Cell-level
      const rows = findChildren(node, "w:tr");
      for (const row of rows) {
        for (const cell of findChildren(row, "w:tc")) {
          const tcPr = findChild(cell, "w:tcPr");
          if (tcPr && findChild(tcPr, "w:shd")) {
            removeChild(tcPr, "w:shd");
            shadingFixes++;
          }
        }
      }
    }
    // Empty paragraph shading
    if ("w:p" in node) {
      const text = getFullText(node).trim();
      if (text === "") {
        const pPr = findChild(node, "w:pPr");
        if (pPr && findChild(pPr, "w:shd")) {
          removeChild(pPr, "w:shd");
          shadingFixes++;
        }
      }
    }
  }
  console.log(`  Removed ${shadingFixes} shading elements`);
  fixes += shadingFixes;

  // ════════════════════════════════════════
  // Fix 6: Table caption format normalization
  // ════════════════════════════════════════
  console.log("\n[6/7] Table caption normalization...");
  let captionFixes = 0;
  for (const node of bodyNodes) {
    if (!("w:p" in node)) continue;
    const text = getFullText(node);
    if (!text.match(/^\s*Таблица/i)) continue;

    const changed = rewriteText(node, (t) => {
      let result = t.trim();
      // Strip leading space
      result = result.replace(/^\s+/, "");
      // "Таблица №5." → "Таблица 5"
      result = result.replace(/^(Таблица)\s*[№#]\s*/i, "Таблица ");
      // Strip trailing dot
      result = result.replace(/^(Таблица\s+\d+(?:\.\d+)?)\s*[.]\s*$/, "$1");
      // Trim
      result = result.trimEnd();
      return result;
    });
    if (changed) {
      console.log(`  Fixed: "${getFullText(node).substring(0, 60)}"`);
      captionFixes++;
    }
  }
  console.log(`  Fixed ${captionFixes} captions`);
  fixes += captionFixes;

  // ════════════════════════════════════════
  // Fix 7: Multiple spaces collapse (all text)
  // ════════════════════════════════════════
  console.log("\n[7/7] Collapsing multiple spaces...");
  let spaceFixes = 0;
  for (const node of bodyNodes) {
    if ("w:p" in node) {
      if (rewriteText(node, (t) => t.replace(/ {2,}/g, " "))) spaceFixes++;
    }
    if ("w:tbl" in node) {
      const rows = findChildren(node, "w:tr");
      for (const row of rows) {
        for (const cell of findChildren(row, "w:tc")) {
          for (const p of findChildren(cell, "w:p")) {
            if (rewriteText(p, (t) => t.replace(/ {2,}/g, " "))) spaceFixes++;
          }
        }
      }
    }
  }
  console.log(`  Fixed ${spaceFixes} paragraphs with multiple spaces`);
  fixes += spaceFixes;

  // ════════════════════════════════════════
  // Fix 8: Clean table sections — each table on its own landscape page
  // ════════════════════════════════════════
  // Strategy: remove ALL existing section breaks and table-related paragraphs
  // that are misplaced, then rebuild: [sectPr portrait] → [subtitle] → [Таблица N] → [table] → [sectPr landscape]
  // Also renumber tables sequentially.
  console.log("\n[8/8] Rebuilding table sections (each table on own landscape page)...");
  let tableSectionFixes = 0;

  function isTableRelated(text: string): boolean {
    if (/^Таблица\s+\d+/i.test(text)) return true;
    if (/^(?:Изучение|Сводная|Испытуемый|Задания|Исследование)/i.test(text)) return true;
    if (/\(в\s*%/i.test(text) || /\(в\s*баллах/i.test(text)) return true;
    return false;
  }

  // Step 1: Remove ALL section break paragraphs (empty paragraphs with w:sectPr)
  // and ALL duplicate/misplaced table-related paragraphs before section breaks
  const sectBreakIndices: number[] = [];
  for (let i = 0; i < bodyNodes.length; i++) {
    if (!("w:p" in bodyNodes[i])) continue;
    const pPr = findChild(bodyNodes[i], "w:pPr");
    if (pPr && findChild(pPr, "w:sectPr")) {
      // Don't remove title page section break
      if (i < 30) continue;
      // Don't remove the final document section
      const isLast = !bodyNodes.slice(i + 1).some(n => "w:p" in n && findChild(findChild(n, "w:pPr") as any, "w:sectPr"));
      if (isLast) continue;
      sectBreakIndices.push(i);
    }
  }
  // Remove in reverse
  for (let i = sectBreakIndices.length - 1; i >= 0; i--) {
    bodyNodes.splice(sectBreakIndices[i], 1);
  }
  console.log(`  Removed ${sectBreakIndices.length} section break paragraphs`);

  // Step 2: Remove duplicate table-related paragraphs
  // (same text appearing right before and right after a table)
  for (let i = bodyNodes.length - 1; i >= 1; i--) {
    if (!("w:p" in bodyNodes[i]) || !("w:p" in bodyNodes[i - 1])) continue;
    const t1 = getFullText(bodyNodes[i]).trim();
    const t2 = getFullText(bodyNodes[i - 1]).trim();
    if (t1 && t1 === t2 && isTableRelated(t1)) {
      bodyNodes.splice(i, 1);
      console.log(`  Removed duplicate: "${t1.substring(0, 50)}..."`);
      tableSectionFixes++;
    }
  }

  // Step 3: For each table, insert landscape section breaks around it
  // Find all tables and their associated caption/subtitle
  const TWIPS_MM = 56.7;
  const pgSzLandscape = { "w:w": "16838", "w:h": "11906", "w:orient": "landscape" };
  const pgSzPortrait = { "w:w": "11906", "w:h": "16838" };
  const pgMargins = {
    "w:top": String(Math.round(20 * TWIPS_MM)),
    "w:right": String(Math.round(10 * TWIPS_MM)),
    "w:bottom": String(Math.round(20 * TWIPS_MM)),
    "w:left": String(Math.round(30 * TWIPS_MM)),
    "w:header": "709", "w:footer": "709", "w:gutter": "0",
  };

  function makeSectBreakPara(landscape: boolean): OrderedXmlNode {
    return createNode("w:p", undefined, [
      createNode("w:pPr", undefined, [
        createNode("w:spacing", { "w:before": "0", "w:after": "0", "w:line": "1", "w:lineRule": "exact" }),
        createNode("w:rPr", undefined, [
          createNode("w:sz", { "w:val": "2" }),
          createNode("w:szCs", { "w:val": "2" }),
        ]),
        createNode("w:sectPr", undefined, [
          createNode("w:type", { "w:val": "nextPage" }),
          createNode("w:pgSz", landscape ? pgSzLandscape : pgSzPortrait),
          createNode("w:pgMar", landscape
            ? { ...pgMargins, "w:top": pgMargins["w:left"], "w:left": pgMargins["w:top"] }
            : pgMargins),
        ]),
      ]),
    ]);
  }

  // Process tables from end to start
  let tableNum = 0;
  const tablePositions: number[] = [];
  for (let i = 0; i < bodyNodes.length; i++) {
    if ("w:tbl" in bodyNodes[i]) tablePositions.push(i);
  }
  tableNum = tablePositions.length;

  for (let ti = tablePositions.length - 1; ti >= 0; ti--) {
    let tblIdx = tablePositions[ti];

    // Skip table 1 (non-landscape, small table near beginning)
    if (ti === 0 && tblIdx < 340) continue;

    // Find associated paragraphs above the table (caption + subtitle)
    let startIdx = tblIdx;
    for (let j = tblIdx - 1; j >= Math.max(0, tblIdx - 4); j--) {
      if (!("w:p" in bodyNodes[j])) break;
      const text = getFullText(bodyNodes[j]).trim();
      if (!text) { startIdx = j; continue; } // include empty paras
      if (isTableRelated(text) || /^Таблица/i.test(text)) {
        startIdx = j;
      } else {
        break;
      }
    }

    // Insert landscape section break BEFORE the group
    bodyNodes.splice(startIdx, 0, makeSectBreakPara(false)); // portrait→landscape break
    tblIdx++;

    // Insert portrait section break AFTER the table
    bodyNodes.splice(tblIdx + 1, 0, makeSectBreakPara(true)); // landscape→portrait break

    tableSectionFixes++;
  }

  console.log(`  Wrapped ${tableSectionFixes} tables in landscape sections`);

  // Step 4: Renumber tables sequentially
  let seqNum = 0;
  for (const node of bodyNodes) {
    if (!("w:p" in node)) continue;
    const text = getFullText(node).trim();
    if (/^Таблица\s+\d+/i.test(text)) {
      seqNum++;
      rewriteText(node, (t) => t.replace(/^Таблица\s+\d+/i, `Таблица ${seqNum}`));
    }
  }
  console.log(`  Renumbered ${seqNum} table captions (1..${seqNum})`);
  fixes += tableSectionFixes;

  // (Fixes 9-11 removed — section breaks rebuilt in fix 8)

  // ════════════════════════════════════════
  // Fix 12: Remove list numbering from "Выводы" sections
  // ════════════════════════════════════════
  // Paragraphs after "Выводы" heading should be plain body text, not numbered list items
  console.log("\n[12] Fixing Выводы sections (removing list numbering)...");
  let vyvodyFixes = 0;
  for (let i = 0; i < bodyNodes.length; i++) {
    if (!("w:p" in bodyNodes[i])) continue;
    const text = getFullText(bodyNodes[i]).trim();
    // Match "Выводы" or "1.5 Выводы" headings (not TOC entries with page numbers)
    if (!text.match(/^(?:\d[\d.]*\s+)?Выводы$/i)) continue;

    // Remove numPr from next paragraphs until next heading or significant break
    for (let j = i + 1; j < Math.min(bodyNodes.length, i + 20); j++) {
      if (!("w:p" in bodyNodes[j])) break;
      const nextText = getFullText(bodyNodes[j]).trim();
      if (!nextText) continue;
      // Stop at next heading
      if (isHeading(bodyNodes[j])) break;

      const pPr = findChild(bodyNodes[j], "w:pPr");
      if (pPr && findChild(pPr, "w:numPr")) {
        removeChild(pPr, "w:numPr");
        // Also remove list indent
        const ind = findChild(pPr, "w:ind");
        if (ind?.[":@"]) {
          delete ind[":@"]["@_w:hanging"];
          delete ind[":@"]["@_w:left"];
        }
        console.log(`  Removed numPr from: "${nextText.substring(0, 50)}..."`);
        vyvodyFixes++;
      }
    }
  }
  console.log(`  Fixed ${vyvodyFixes} paragraphs in Выводы`);
  fixes += vyvodyFixes;

  // ════════════════════════════════════════
  // Fix 13: Add "Рисунок N" captions to charts/diagrams
  // ════════════════════════════════════════
  console.log("\n[13] Adding figure captions to charts...");
  let figureFixes = 0;
  let figureCounter = 1;

  for (let i = 0; i < bodyNodes.length; i++) {
    if (!("w:p" in bodyNodes[i])) continue;
    const runs = getRuns(bodyNodes[i]);
    let hasDrawing = false;
    for (const r of runs) {
      if (findChild(r, "w:drawing") || findChild(r, "mc:AlternateContent")) hasDrawing = true;
    }
    if (!hasDrawing) continue;

    // Skip title page logo (first drawing, index < 30)
    if (i < 30) continue;

    // Check if already has caption after
    const nextText = (i + 1 < bodyNodes.length && "w:p" in bodyNodes[i + 1])
      ? getFullText(bodyNodes[i + 1]).trim() : "";
    if (nextText.match(/^Рисунок/i)) {
      figureCounter++;
      continue;
    }

    // Find a reasonable caption from context (heading before the chart)
    let captionTitle = "";
    for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
      if (!("w:p" in bodyNodes[j])) continue;
      const t = getFullText(bodyNodes[j]).trim();
      if (t.match(/качественный анализ/i)) {
        captionTitle = "Результаты качественного анализа";
        break;
      }
      if (t.match(/количественный анализ/i)) {
        captionTitle = "Результаты количественного анализа";
        break;
      }
    }

    const captionText = captionTitle
      ? `Рисунок ${figureCounter} – ${captionTitle}`
      : `Рисунок ${figureCounter}`;

    // Create caption paragraph: center, 14pt, no indent
    const captionPara = createNode("w:p", undefined, [
      createNode("w:pPr", undefined, [
        createNode("w:jc", { "w:val": "center" }),
        createNode("w:spacing", { "w:line": "360", "w:lineRule": "auto", "w:before": "120", "w:after": "0" }),
      ]),
      createNode("w:r", undefined, [
        createNode("w:rPr", undefined, [
          createNode("w:rFonts", { "w:ascii": "Times New Roman", "w:hAnsi": "Times New Roman", "w:cs": "Times New Roman" }),
          createNode("w:sz", { "w:val": "28" }),
          createNode("w:szCs", { "w:val": "28" }),
        ]),
        createNode("w:t", { "xml:space": "preserve" }, [createTextNode(captionText)]),
      ]),
    ]);

    // Insert caption AFTER the drawing paragraph
    bodyNodes.splice(i + 1, 0, captionPara);
    console.log(`  Added: "${captionText}" after drawing at index ${i}`);
    figureCounter++;
    figureFixes++;
    i++; // skip the new caption
  }
  console.log(`  Added ${figureFixes} figure captions`);
  fixes += figureFixes;

  // ════════════════════════════════════════
  // Save
  // ════════════════════════════════════════
  console.log("\n═══════════════════════════════");
  console.log(`Total fixes: ${fixes}`);
  console.log("Saving golden reference...");

  const newXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newXml);

  const outBuf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  fs.writeFileSync(OUTPUT, outBuf as Buffer);
  console.log(`\n✅ Golden reference saved: ${OUTPUT}`);
  console.log(`   Size: ${Math.round((outBuf as Buffer).length / 1024)}KB`);
}

main().catch(console.error);
