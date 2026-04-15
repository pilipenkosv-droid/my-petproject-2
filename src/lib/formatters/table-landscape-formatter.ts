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
const M_RIGHT = Math.round(10 * TWIPS_PER_MM);  // 567

/** Доступная ширина в портрете: 210 - 30 - 10 = 170мм */
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
  // Таблицы с <3 столбцами не поворачиваем
  if (colCount < 3) return false;

  // Проверяем ширину по gridCol
  const gridW = getTableGridWidth(tbl);
  if (gridW && gridW > PORTRAIT_AVAIL) return true;

  // Проверяем ширину по w:tblW (общая ширина таблицы)
  if (!gridW) {
    const tblPr = findChild(tbl, "w:tblPr");
    if (tblPr) {
      const tblW = findChild(tblPr, "w:tblW");
      const wVal = tblW?.[":@"]?.["@_w:w"];
      const wType = tblW?.[":@"]?.["@_w:type"];
      if (wVal && wType !== "pct" && wType !== "auto") {
        const width = parseInt(String(wVal));
        if (width > PORTRAIT_AVAIL) return true;
      }
    }
  }

  // Очень много столбцов → landscape без проверки ширины
  if (colCount >= 9) return true;

  // 7-8 столбцов → landscape только если есть данные о ширине, подтверждающие ширину
  if (colCount >= MIN_COLS && gridW && gridW > PORTRAIT_AVAIL * 0.85) return true;

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
  if (wideIndices.length === 0) {
    console.log(`[landscape] No wide tables found (checked ${bc.filter(n => "w:tbl" in n).length} tables)`);
    return buffer;
  }

  // Process from end to preserve indices
  let count = 0;
  for (let k = wideIndices.length - 1; k >= 0; k--) {
    let tblIdx = wideIndices[k];

    // Include preceding caption in landscape section
    // Search back up to 3 paragraphs (caption may be separated by empty paragraphs)
    let insertBefore = tblIdx;
    for (let lookback = 1; lookback <= 3 && tblIdx - lookback >= 0; lookback++) {
      const prev = bc[tblIdx - lookback];
      if (!("w:p" in prev)) break;
      const txt = getParagraphText(prev).trim();
      if (/^Таблица\s+\d+/i.test(txt)) {
        insertBefore = tblIdx - lookback;
        break;
      }
      // Skip empty paragraphs between caption and table
      if (txt !== "") break;
    }

    // Skip if already has section break nearby
    if (insertBefore > 0 && "w:p" in bc[insertBefore - 1]) {
      const prevPPr = findChild(bc[insertBefore - 1], "w:pPr");
      if (prevPPr && findChild(prevPPr, "w:sectPr")) continue;
    }

    // 1. Portrait section break before table/caption
    // Делаем параграф невидимым: шрифт 2pt, нулевые отступы (иначе серая полоса в Word)
    const portraitPara = createNode("w:p", undefined, [
      createNode("w:pPr", undefined, [
        createNode("w:spacing", { "w:before": "0", "w:after": "0", "w:line": "240", "w:lineRule": "auto" }),
        createNode("w:rPr", undefined, [
          createNode("w:sz", { "w:val": "2" }),
          createNode("w:szCs", { "w:val": "2" }),
        ]),
        portraitSectPr(),
      ]),
    ]);
    bc.splice(insertBefore, 0, portraitPara);
    tblIdx++; // shifted by insertion

    // 2. Landscape section break after table
    const landscapePara = createNode("w:p", undefined, [
      createNode("w:pPr", undefined, [
        createNode("w:spacing", { "w:before": "0", "w:after": "0", "w:line": "240", "w:lineRule": "auto" }),
        createNode("w:rPr", undefined, [
          createNode("w:sz", { "w:val": "2" }),
          createNode("w:szCs", { "w:val": "2" }),
        ]),
        landscapeSectPr(),
      ]),
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
