// Хазард: 5×4 таблица с гридспаном на 3 заголовочных ячейках и роуспаном
// на 2 телесных ячейках. Проверяет живучесть w:gridSpan/w:vMerge при рестайле.
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { BASE_SIZE, FONT, bodyPara, buildGostShell } from "../common";
import { countInParts, finalize } from "../inject";
import type { DocBuildResult } from "./types";

const COLS = 5;

function cell(text: string, opts?: { columnSpan?: number; rowSpan?: number; header?: boolean }): TableCell {
  return new TableCell({
    columnSpan: opts?.columnSpan,
    rowSpan: opts?.rowSpan,
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: FONT, size: BASE_SIZE, bold: opts?.header ?? false })],
      }),
    ],
  });
}

function buildTable(): Table {
  const header = new TableRow({
    children: [
      cell("Раздел", { columnSpan: 2, header: true }),
      cell("Период", { columnSpan: 2, header: true }),
      cell("Итого", { columnSpan: 1, header: true }),
    ],
  });
  const row1 = new TableRow({
    children: [
      cell("Показатель A", { rowSpan: 2 }),
      cell("1 кв."),
      cell("2 кв."),
      cell("3 кв."),
      cell("120"),
    ],
  });
  const row2 = new TableRow({
    // первая ячейка — продолжение вертикального слияния из row1, Table сам её вставит
    children: [cell("1 кв."), cell("2 кв."), cell("3 кв."), cell("140")],
  });
  const row3 = new TableRow({
    children: [
      cell("Показатель B", { rowSpan: 2 }),
      cell("1 кв."),
      cell("2 кв."),
      cell("3 кв."),
      cell("95"),
    ],
  });
  const row4 = new TableRow({
    children: [cell("1 кв."), cell("2 кв."), cell("3 кв."), cell("110")],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array(COLS).fill(Math.floor(9000 / COLS)),
    rows: [header, row1, row2, row3, row4],
  });
}

export async function build(): Promise<DocBuildResult> {
  const chapterBody = [
    bodyPara("Таблица 1 — сводные показатели по разделам", { bold: true, center: true }),
    buildTable(),
    bodyPara("Приведённая таблица иллюстрирует объединение ячеек по горизонтали и вертикали."),
  ];

  const doc = new Document({
    creator: "Un-named",
    sections: [{ properties: {}, children: buildGostShell({ title: "Учёт объединённых ячеек в таблицах", chapterBody }) }],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const mustSurvive = {
    "w:tbl": await countInParts(buffer, ["word/document.xml"], /<w:tbl>/g),
    "w:gridSpan": await countInParts(buffer, ["word/document.xml"], /<w:gridSpan\b/g),
    "w:vMerge": await countInParts(buffer, ["word/document.xml"], /<w:vMerge\b/g),
  };

  return { file: "01-merged-cells.docx", hazard: "merged-cells (gridSpan+vMerge)", buffer, mustSurvive };
}
