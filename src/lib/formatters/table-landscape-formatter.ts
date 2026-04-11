/**
 * Ландшафтная ориентация для широких таблиц
 *
 * ГОСТ 7.32-2017 п.6.7: таблицу с большим количеством столбцов
 * допускается размещать в альбомной ориентации.
 *
 * Определяет широкие таблицы (по gridCol или кол-ву столбцов),
 * оборачивает в отдельные landscape-секции (w:sectPr).
 */

import JSZip from "jszip";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  findChild,
  findChildren,
  getText,
  getRuns,
  children,
  createNode,
} from "../xml/docx-xml";

const TWIPS_PER_MM = 56.7;

// A4 dimensions in twips
const A4_W = 11906;
const A4_H = 16838;

// ГОСТ margins (twips)
const M_TOP = Math.round(20 * TWIPS_PER_MM);    // 1134
const M_BOTTOM = Math.round(20 * TWIPS_PER_MM); // 1134
const M_LEFT = Math.round(30 * TWIPS_PER_MM);   // 1701
const M_RIGHT = Math.round(15 * TWIPS_PER_MM);  // 850

/** Доступная ширина в портрете: 210 - 30 - 15 = 165мм */
const PORTRAIT_AVAIL = A4_W - M_LEFT - M_RIGHT; // ~9355 twips

/** Минимум столбцов для автоматического landscape */
const MIN_COLS = 7;

// ── Width Detection ──

function getTableGridWidth(tbl: OrderedXmlNode): number | null {
  const grid = findChild(tbl, "w:tblGrid");
  if (!grid) return null;
  const cols = findChildren(grid, "w:gridCol");
  if (cols.length === 0) return null;

  let total = 0;
  for (const c of cols) {
    total += parseInt(String(c[":@"]?.["@_w:w"] || "0"));
  }
  return total > 0 ? total : null;
}

function getColumnCount(tbl: OrderedXmlNode): number {
  const grid = findChild(tbl, "w:tblGrid");
  if (grid) {
    const cols = findChildren(grid, "w:gridCol");
    if (cols.length > 0) return cols.length;
  }

  // Fallback: max cells across all rows (accounting for gridSpan)
  const rows = findChildren(tbl, "w:tr");
  let max = 0;
  for (const row of rows) {
    const cells = findChildren(row, "w:tc");
    let count = 0;
    for (const cell of cells) {
      const tcPr = findChild(cell, "w:tcPr");
      const span = tcPr ? findChild(tcPr, "w:gridSpan") : null;
      count += span?.[":@"]?.["@_w:val"]
        ? parseInt(String(span[":@"]["@_w:val"]))
        : 1;
    }
    max = Math.max(max, count);
  }
  return max;
}

function needsLandscape(tbl: OrderedXmlNode): boolean {
  const colCount = getColumnCount(tbl);
  // Таблицы с <4 столбцами не поворачиваем, даже если gridWidth широкий
  if (colCount < 4) return false;

  const gridW = getTableGridWidth(tbl);
  if (gridW && gridW > PORTRAIT_AVAIL) return true;
  if (colCount >= MIN_COLS) return true;
  return false;
}

// ── Section Break Builders ──

function portraitSectPr(): OrderedXmlNode {
  return createNode("w:sectPr", undefined, [
    createNode("w:type", { "w:val": "nextPage" }),
    { "w:pgSz": [], ":@": { "@_w:w": String(A4_W), "@_w:h": String(A4_H) } },
    {
      "w:pgMar": [],
      ":@": {
        "@_w:top": String(M_TOP), "@_w:right": String(M_RIGHT),
        "@_w:bottom": String(M_BOTTOM), "@_w:left": String(M_LEFT),
        "@_w:header": "709", "@_w:footer": "709", "@_w:gutter": "0",
      },
    },
  ]);
}

function landscapeSectPr(): OrderedXmlNode {
  return createNode("w:sectPr", undefined, [
    createNode("w:type", { "w:val": "nextPage" }),
    {
      "w:pgSz": [],
      ":@": {
        "@_w:w": String(A4_H), "@_w:h": String(A4_W),
        "@_w:orient": "landscape",
      },
    },
    {
      "w:pgMar": [],
      ":@": {
        "@_w:top": String(M_TOP), "@_w:right": String(M_RIGHT),
        "@_w:bottom": String(M_BOTTOM), "@_w:left": String(M_LEFT),
        "@_w:header": "709", "@_w:footer": "709", "@_w:gutter": "0",
      },
    },
  ]);
}

// ── Paragraph Text Helper ──

function getParagraphText(node: OrderedXmlNode): string {
  if (!("w:p" in node)) return "";
  const runs = getRuns(node);
  let text = "";
  for (const run of runs) {
    for (const t of findChildren(run, "w:t")) {
      text += getText(t);
    }
  }
  return text;
}

// ── Main ──

/**
 * Оборачивает широкие таблицы в альбомные секции.
 *
 * Для каждой широкой таблицы:
 * 1. Вставляет пустой параграф с portrait sectPr ПЕРЕД таблицей/подписью
 *    → завершает портретную секцию
 * 2. Вставляет пустой параграф с landscape sectPr ПОСЛЕ таблицы
 *    → завершает ландшафтную секцию
 * 3. Подпись таблицы (если есть перед ней) включается в ландшафтную секцию
 */
export async function applyLandscapeForWideTables(
  buffer: Buffer
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return buffer;

  const parsed = parseDocxXml(xml);
  const body = getBody(parsed);
  if (!body) return buffer;

  const bc = children(body);

  // Collect wide table indices
  const wideIndices: number[] = [];
  for (let i = 0; i < bc.length; i++) {
    if ("w:tbl" in bc[i] && needsLandscape(bc[i])) {
      wideIndices.push(i);
    }
  }
  if (wideIndices.length === 0) return buffer;

  // Process from end to preserve indices
  let count = 0;
  for (let k = wideIndices.length - 1; k >= 0; k--) {
    let tblIdx = wideIndices[k];

    // Include preceding caption in landscape section
    let insertBefore = tblIdx;
    if (tblIdx > 0 && "w:p" in bc[tblIdx - 1]) {
      const txt = getParagraphText(bc[tblIdx - 1]).trim();
      if (/^Таблица\s+\d+/i.test(txt)) {
        insertBefore = tblIdx - 1;
      }
    }

    // Skip if already has section break nearby
    if (insertBefore > 0 && "w:p" in bc[insertBefore - 1]) {
      const prevPPr = findChild(bc[insertBefore - 1], "w:pPr");
      if (prevPPr && findChild(prevPPr, "w:sectPr")) continue;
    }

    // 1. Portrait section break before table/caption
    const portraitPara = createNode("w:p", undefined, [
      createNode("w:pPr", undefined, [portraitSectPr()]),
    ]);
    bc.splice(insertBefore, 0, portraitPara);
    tblIdx++; // shifted by insertion

    // 2. Landscape section break after table
    const landscapePara = createNode("w:p", undefined, [
      createNode("w:pPr", undefined, [landscapeSectPr()]),
    ]);
    bc.splice(tblIdx + 1, 0, landscapePara);

    count++;
    const cols = getColumnCount(bc[tblIdx]);
    console.log(`[landscape] Table at index ${tblIdx} → landscape (${cols} columns)`);
  }

  if (count === 0) return buffer;
  console.log(`[landscape] Wrapped ${count} wide table(s) in landscape sections`);

  zip.file("word/document.xml", buildDocxXml(parsed));
  return (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;
}
