/**
 * Нормализация ячеек таблицы: шрифт, размер, горизонтальное выравнивание.
 *
 * Фикс для ruleId `table-N-rX-cY-fontsize` и `table-N-rX-cY-align`
 * из document-analyzer.ts — анализатор их детектит, но до сих пор
 * ни один форматтер не применял их системно к вложенным таблицам
 * и не выставлял w:jc в ячейках.
 */

import JSZip from "jszip";
import type { FormattingRules } from "@/types/formatting-rules";
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
} from "../xml/docx-xml";

const HALF_POINTS_PER_PT = 2;

const JC_MAP: Record<string, string> = {
  left: "left",
  center: "center",
  right: "right",
  justify: "both",
};

function isNumericCell(paragraphs: OrderedXmlNode[]): boolean {
  let text = "";
  for (const p of paragraphs) {
    for (const run of getRuns(p)) text += getRunText(run);
  }
  const t = text.trim();
  if (!t) return false;
  return /^[-+]?[\d\s.,%\u00A0()/–—-]+$/.test(t) && /\d/.test(t);
}

function normalizeCell(
  cell: OrderedXmlNode,
  fontFamily: string,
  sizeHalfMin: number,
  sizeHalfMax: number,
  defaultJc: string,
  isHeaderRow: boolean,
  headerJc: string
): { paragraphsFixed: number } {
  let paragraphsFixed = 0;
  const cellParas = findChildren(cell, "w:p");
  const numericJc = isNumericCell(cellParas) ? "center" : defaultJc;
  const targetJc = isHeaderRow ? headerJc : numericJc;
  const targetJcVal = JC_MAP[targetJc] || "left";

  for (const p of cellParas) {
    const pPr = ensurePPr(p);
    setOrderedProp(pPr, "w:jc", { "w:val": targetJcVal });

    const runs = getRuns(p);
    for (const run of runs) {
      const rPr = ensureRPr(run);

      setOrderedProp(rPr, "w:rFonts", {
        "w:ascii": fontFamily,
        "w:hAnsi": fontFamily,
        "w:cs": fontFamily,
      });

      const szNode = findChild(rPr, "w:sz");
      const current = szNode?.[":@"]?.["@_w:val"]
        ? Number(szNode[":@"]["@_w:val"])
        : undefined;
      const outOfRange =
        current === undefined || current < sizeHalfMin || current > sizeHalfMax;
      if (outOfRange) {
        setOrderedProp(rPr, "w:sz", { "w:val": String(sizeHalfMax) });
        setOrderedProp(rPr, "w:szCs", { "w:val": String(sizeHalfMax) });
      }
    }
    paragraphsFixed++;
  }

  return { paragraphsFixed };
}

function walkTables(
  container: OrderedXmlNode,
  fontFamily: string,
  sizeHalfMin: number,
  sizeHalfMax: number,
  defaultJc: string,
  headerJc: string,
  stats: { cellsFixed: number; paragraphsFixed: number }
): void {
  const ch = children(container);
  for (const node of ch) {
    if ("w:tbl" in node) {
      const rows = findChildren(node, "w:tr");
      rows.forEach((row, rowIdx) => {
        const isHeader = rowIdx === 0;
        const cells = findChildren(row, "w:tc");
        for (const cell of cells) {
          const { paragraphsFixed } = normalizeCell(
            cell,
            fontFamily,
            sizeHalfMin,
            sizeHalfMax,
            defaultJc,
            isHeader,
            headerJc
          );
          stats.cellsFixed++;
          stats.paragraphsFixed += paragraphsFixed;
          walkTables(
            cell,
            fontFamily,
            sizeHalfMin,
            sizeHalfMax,
            defaultJc,
            headerJc,
            stats
          );
        }
      });
    } else if (typeof node === "object" && node !== null) {
      const hasTable = children(node).some((c) => "w:tbl" in c);
      if (hasTable) {
        walkTables(
          node,
          fontFamily,
          sizeHalfMin,
          sizeHalfMax,
          defaultJc,
          headerJc,
          stats
        );
      }
    }
  }
}

export async function applyTableCellsFormatting(
  buffer: Buffer,
  rules: FormattingRules
): Promise<{ buffer: Buffer; cellsFixed: number; paragraphsFixed: number }> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return { buffer, cellsFixed: 0, paragraphsFixed: 0 };

  const parsed = parseDocxXml(xml);
  const body = getBody(parsed);
  if (!body) return { buffer, cellsFixed: 0, paragraphsFixed: 0 };

  const tableRules = rules.specialElements?.tables;
  const fontFamily = rules.text.fontFamily;
  const maxPt = tableRules?.fontSize?.default ?? rules.text.fontSize ?? 12;
  const minPt = tableRules?.fontSize?.exceptional ?? maxPt;
  const sizeHalfMax = maxPt * HALF_POINTS_PER_PT;
  const sizeHalfMin = minPt * HALF_POINTS_PER_PT;

  const defaultJc = "left";
  const headerJc = tableRules?.headers?.alignment || "center";

  const stats = { cellsFixed: 0, paragraphsFixed: 0 };
  walkTables(body, fontFamily, sizeHalfMin, sizeHalfMax, defaultJc, headerJc, stats);

  if (stats.cellsFixed === 0) {
    return { buffer, cellsFixed: 0, paragraphsFixed: 0 };
  }

  zip.file("word/document.xml", buildDocxXml(parsed));
  const out = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;

  console.log(
    `[table-cells] Normalized ${stats.cellsFixed} cells / ${stats.paragraphsFixed} paragraphs (font=${fontFamily}, size=${minPt}-${maxPt}pt, headerJc=${headerJc})`
  );

  return { buffer: out, ...stats };
}
