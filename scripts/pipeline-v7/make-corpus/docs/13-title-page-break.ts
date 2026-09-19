// Хазард (регресс P0): первая строка титульного листа несёт ручной разрыв
// страницы (<w:br w:type="page"/>) прямо в своём run. classify/passes.ts
// закрывает область титула сразу за этим абзацем (hasPageBreakRun → i+1), и
// title_page схлопывается до одного абзаца, хотя визуально титул занимает
// десяток строк. Точка вставки оглавления уезжает на вторую строку документа
// — TOC оказывается внутри титульного листа.
//
// Вторая половина хазарда: содержание набрано руками (жирная строка
// «СОДЕРЖАНИЕ» + строки с точечными лидерами), стилей TOC нет. Ожидание —
// такое оглавление распознаётся и своё не вставляется (tocSkipped).
import { AlignmentType, Document, Footer, Header, LevelFormat, PageBreak, Packer, Paragraph, TextRun } from "docx";
import {
  BASE_SIZE,
  FONT,
  bodyPara,
  conclusionSection,
  bibliographyHeading,
  chapterHeading,
  fillerParagraphs,
  shortBibliographyPlaceholder,
  subheading11,
  titlePageParagraphs,
} from "../common";
import { countInParts, finalize } from "../inject";
import type { DocBuildResult } from "./types";

/** Тот же центрированный абзац титула, но с разрывом страницы внутри run. */
function titleLineWithBreak(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120, line: 360 },
    children: [new TextRun({ text, font: FONT, size: BASE_SIZE }), new PageBreak()],
  });
}

/** Рукописное содержание: жирный заголовок и строки с точечными лидерами. */
function handwrittenContents(): Paragraph[] {
  return [
    bodyPara("СОДЕРЖАНИЕ", { center: true, bold: true }),
    bodyPara("Введение .................................................................. 3"),
    bodyPara("1 Обзор предметной области ...................................... 4"),
    bodyPara("1.1 Постановка задачи ............................................... 4"),
    bodyPara("Заключение ............................................................. 6"),
    bodyPara("Список использованных источников ........................ 7"),
  ];
}

function listItem(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: "p0-bulleted", level: 0 },
    children: [new TextRun({ text, font: FONT, size: BASE_SIZE })],
  });
}

export async function build(): Promise<DocBuildResult> {
  const [, ...restOfTitle] = titlePageParagraphs(
    "Разрыв страницы в первой строке титульного листа",
    "КУРСОВАЯ РАБОТА",
  );

  const children = [
    titleLineWithBreak("МИНИСТЕРСТВО ОБРАЗОВАНИЯ И НАУКИ (синтетический пример)"),
    ...restOfTitle,
    ...handwrittenContents(),
    // «Введение» — жирный обычный абзац, а не Heading 1: ровно так его
    // набирают в реальных работах, где заголовки сделаны руками.
    bodyPara("ВВЕДЕНИЕ", { center: true, bold: true }),
    ...fillerParagraphs(4, 0),
    chapterHeading(),
    subheading11(),
    ...fillerParagraphs(5, 1),
    listItem("Первый пункт перечисления"),
    listItem("Второй пункт перечисления"),
    listItem("Третий пункт перечисления"),
    ...fillerParagraphs(4, 3),
    ...conclusionSection(),
    bibliographyHeading(),
    ...shortBibliographyPlaceholder(),
  ];

  const doc = new Document({
    creator: "Un-named",
    numbering: {
      config: [
        {
          reference: "p0-bulleted",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "—", alignment: AlignmentType.LEFT }],
        },
      ],
    },
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [bodyPara("Синтетическая курсовая работа", { center: true })],
          }),
        },
        footers: { default: new Footer({ children: [bodyPara("Стр.", { center: true })] }) },
        children,
      },
    ],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const mustSurvive = {
    "page-break-run": await countInParts(buffer, ["word/document.xml"], /<w:br w:type="page"\/>/g),
    "toc-dot-leaders": await countInParts(buffer, ["word/document.xml"], /\.{10,}/g),
    "w:numPr": await countInParts(buffer, ["word/document.xml"], /<w:numPr>/g),
    "heading-paragraphs": await countInParts(buffer, ["word/document.xml"], /<w:pStyle w:val="Heading[12]"\/>/g),
  };

  return {
    file: "13-title-page-break.docx",
    hazard: "title-page break in first paragraph + handwritten TOC (P0 regression)",
    buffer,
    mustSurvive,
  };
}
