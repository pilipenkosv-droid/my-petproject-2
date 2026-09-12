// Хазард: 4 закладки (w:bookmarkStart/End) на заголовках/подписи + поля
// REF, PAGEREF, SEQ Таблица, NOTEREF через docx SimpleField (fldSimple).
import { AlignmentType, Bookmark, Document, HeadingLevel, Packer, Paragraph, SimpleField, TextRun } from "docx";
import {
  BASE_SIZE,
  FONT,
  bibliographyHeading,
  bodyPara,
  conclusionSection,
  contentsPlaceholder,
  fillerParagraphs,
  half,
  introductionSection,
  shortBibliographyPlaceholder,
  titlePageParagraphs,
} from "../common";
import { countInParts, finalize } from "../inject";
import type { DocBuildResult } from "./types";

function bookmarkedHeading1(text: string, bookmarkId: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
    children: [new Bookmark({ id: bookmarkId, children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: half(16), bold: true })] })],
  });
}

function bookmarkedHeading2(text: string, bookmarkId: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 160 },
    children: [new Bookmark({ id: bookmarkId, children: [new TextRun({ text, font: FONT, size: half(14), bold: true })] })],
  });
}

function bookmarkedCaption(text: string, bookmarkId: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new Bookmark({ id: bookmarkId, children: [new TextRun({ text, font: FONT, size: BASE_SIZE, bold: true })] })],
  });
}

export async function build(): Promise<DocBuildResult> {
  const chapter = bookmarkedHeading1("1 Обзор предметной области", "bmChapter1");
  const sub11 = bookmarkedHeading2("1.1 Постановка задачи", "bmSub11");
  const caption = bookmarkedCaption("Таблица 1 — контрольные значения", "bmTable1");
  const conclusionHeading = bookmarkedHeading1("Заключение", "bmConclusion");

  const doc = new Document({
    creator: "Un-named",
    sections: [
      {
        properties: {},
        children: [
          ...titlePageParagraphs("Перекрёстные ссылки и поля", "КУРСОВАЯ РАБОТА"),
          ...contentsPlaceholder(),
          ...introductionSection(),
          chapter,
          sub11,
          ...fillerParagraphs(2, 0),
          caption,
          bodyPara("Ниже приведены поля, ссылающиеся на закладки, расставленные выше по документу."),
          new Paragraph({ children: [new TextRun({ text: "Ссылка на главу: ", font: FONT, size: BASE_SIZE }), new SimpleField("REF bmChapter1 \\h")] }),
          new Paragraph({ children: [new TextRun({ text: "Номер страницы главы: ", font: FONT, size: BASE_SIZE }), new SimpleField("PAGEREF bmChapter1 \\h")] }),
          new Paragraph({ children: [new TextRun({ text: "Порядковый номер таблицы: ", font: FONT, size: BASE_SIZE }), new SimpleField("SEQ Таблица \\* ARABIC")] }),
          new Paragraph({ children: [new TextRun({ text: "Ссылка на примечание: ", font: FONT, size: BASE_SIZE }), new SimpleField("NOTEREF bmSub11 \\h")] }),
          conclusionHeading,
          ...fillerParagraphs(2, 4),
          bibliographyHeading(),
          ...shortBibliographyPlaceholder(),
        ],
      },
    ],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const mustSurvive = {
    "w:bookmarkStart": await countInParts(buffer, ["word/document.xml"], /<w:bookmarkStart\b/g),
    "fldSimple:REF": await countInParts(buffer, ["word/document.xml"], /w:instr="REF /g),
    "fldSimple:PAGEREF": await countInParts(buffer, ["word/document.xml"], /w:instr="PAGEREF /g),
    "fldSimple:SEQ": await countInParts(buffer, ["word/document.xml"], /w:instr="SEQ /g),
    "fldSimple:NOTEREF": await countInParts(buffer, ["word/document.xml"], /w:instr="NOTEREF /g),
  };

  return { file: "04-crossrefs.docx", hazard: "crossrefs (bookmarks+fields)", buffer, mustSurvive };
}
