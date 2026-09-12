// Хазард: 3 секции — portrait → landscape (с широкой таблицей) → portrait
// 2-колонки; типы разрыва nextPage и continuous.
import { Document, Packer, Paragraph, SectionType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { BASE_SIZE, FONT, bodyPara, buildGostShell, heading1 } from "../common";
import { countInParts, finalize } from "../inject";
import type { DocBuildResult } from "./types";

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: BASE_SIZE })] })] });
}

function wideTable(): Table {
  const cols = 8;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: Array.from({ length: 3 }, (_, r) => new TableRow({ children: Array.from({ length: cols }, (_, c) => cell(`${r + 1}.${c + 1}`)) })),
  });
}

export async function build(): Promise<DocBuildResult> {
  const chapterBody = [bodyPara("Основной текст главы 1 расположен в книжной ориентации, секция 1.")];

  const doc = new Document({
    creator: "Un-named",
    sections: [
      {
        // Секция 1: книжная, основной текст (ГОСТ-скелет).
        properties: { page: { size: { orientation: "portrait" } } },
        children: buildGostShell({ title: "Многосекционный документ", chapterBody }),
      },
      {
        // Секция 2: альбомная, разрыв nextPage, широкая таблица.
        properties: { type: SectionType.NEXT_PAGE, page: { size: { orientation: "landscape" } } },
        children: [heading1("Приложение А — широкая таблица"), wideTable()],
      },
      {
        // Секция 3: книжная, 2 колонки, разрыв continuous.
        properties: { type: SectionType.CONTINUOUS, page: { size: { orientation: "portrait" } }, column: { count: 2 } },
        children: [
          heading1("Приложение Б — двухколоночный текст"),
          bodyPara("Текст этой секции набран в две колонки после непрерывного разрыва раздела."),
          bodyPara("Вторая колонка продолжает изложение того же приложения."),
        ],
      },
    ],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const mustSurvive = {
    "w:sectPr": await countInParts(buffer, ["word/document.xml"], /<w:sectPr\b/g),
    "w:orient=landscape": await countInParts(buffer, ["word/document.xml"], /w:orient="landscape"/g),
    "w:cols[num=2]": await countInParts(buffer, ["word/document.xml"], /<w:cols w:num="2"/g),
  };

  return { file: "05-multi-section.docx", hazard: "multi-section (orientation+columns)", buffer, mustSurvive };
}
