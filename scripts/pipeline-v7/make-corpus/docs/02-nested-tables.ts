// Хазард: таблица 3×3, в ячейке (2,2) — вложенная таблица 2×2. Проверяет
// живучесть вложенной структуры w:tbl (docx lib поддерживает Table как child
// TableCell нативно — инъекция не нужна).
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { BASE_SIZE, FONT, bodyPara, buildGostShell } from "../common";
import { countInParts, finalize } from "../inject";
import type { DocBuildResult } from "./types";

function textCell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: BASE_SIZE })] })] });
}

function innerTable(): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [textCell("a1"), textCell("a2")] }),
      new TableRow({ children: [textCell("b1"), textCell("b2")] }),
    ],
  });
}

function outerTable(): Table {
  const rows: TableRow[] = [];
  for (let r = 1; r <= 3; r++) {
    const cells: TableCell[] = [];
    for (let c = 1; c <= 3; c++) {
      if (r === 2 && c === 2) {
        cells.push(new TableCell({ children: [innerTable()] }));
      } else {
        cells.push(textCell(`R${r}C${c}`));
      }
    }
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

export async function build(): Promise<DocBuildResult> {
  const chapterBody = [
    bodyPara("Таблица 1 — внешняя структура с вложенной таблицей", { bold: true, center: true }),
    outerTable(),
    bodyPara("Абзац после вложенной таблицы, завершающий пример."),
  ];

  const doc = new Document({
    creator: "Un-named",
    sections: [{ properties: {}, children: buildGostShell({ title: "Вложенные таблицы", chapterBody }) }],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const mustSurvive = {
    "w:tbl": await countInParts(buffer, ["word/document.xml"], /<w:tbl>/g),
  };

  return { file: "02-nested-tables.docx", hazard: "nested-tables", buffer, mustSurvive };
}
