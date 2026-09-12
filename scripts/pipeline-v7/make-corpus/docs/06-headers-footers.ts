// Хазард: разный первый лист + чёт/нечёт колонтитулы; футер с полями
// PAGE/NUMPAGES.
import { BASE_SIZE, FONT, buildGostShell } from "../common";
import { Document, Footer, Header, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { countInParts, finalize, listParts } from "../inject";
import type { DocBuildResult } from "./types";

function headerPara(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, font: FONT, size: BASE_SIZE - 4, italics: true })] });
}

function pageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: "Стр. ", font: FONT, size: BASE_SIZE - 4 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: BASE_SIZE - 4 }),
          new TextRun({ text: " из ", font: FONT, size: BASE_SIZE - 4 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: BASE_SIZE - 4 }),
        ],
      }),
    ],
  });
}

export async function build(): Promise<DocBuildResult> {
  const chapterBody = [
    ...Array.from({ length: 6 }, () => new Paragraph({ children: [new TextRun({ text: "Заполняющий абзац для проверки колонтитулов на нескольких страницах.", font: FONT, size: BASE_SIZE })] })),
  ];

  const doc = new Document({
    creator: "Un-named",
    evenAndOddHeaderAndFooters: true,
    sections: [
      {
        properties: { titlePage: true },
        headers: {
          default: new Header({ children: [headerPara("Колонтитул — нечётная страница")] }),
          first: new Header({ children: [headerPara("Колонтитул — первая страница (титульный лист)")] }),
          even: new Header({ children: [headerPara("Колонтитул — чётная страница")] }),
        },
        footers: {
          default: pageFooter(),
          first: pageFooter(),
          even: pageFooter(),
        },
        children: buildGostShell({ title: "Колонтитулы с разным первым листом", chapterBody }),
      },
    ],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const headerParts = await listParts(buffer, "word/header");
  const footerParts = await listParts(buffer, "word/footer");
  const settingsXml = await countInParts(buffer, ["word/settings.xml"], /<w:evenAndOddHeaders\/>/g);

  const mustSurvive = {
    "header-parts": headerParts.length,
    "footer-parts": footerParts.length,
    "w:titlePg": await countInParts(buffer, ["word/document.xml"], /<w:titlePg\/>/g),
    "w:evenAndOddHeaders": settingsXml,
    "instrText:PAGE": await countInParts(buffer, footerParts, /<w:instrText[^>]*>PAGE<\/w:instrText>/g),
    "instrText:NUMPAGES": await countInParts(buffer, footerParts, /<w:instrText[^>]*>NUMPAGES<\/w:instrText>/g),
  };

  return { file: "06-headers-footers.docx", hazard: "headers-footers (titlePg+evenOdd)", buffer, mustSurvive };
}
