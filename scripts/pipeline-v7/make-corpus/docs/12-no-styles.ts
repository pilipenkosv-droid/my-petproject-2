// Хазард: полное отсутствие абзацных стилей (кроме неявного Normal) — ни
// HeadingLevel, ни numbering, ни TableOfContents. Заголовки — жирный
// caps-текст по центру прямым форматированием; маркеры списков вписаны
// вручную («1. », «— »); отступы — прямым форматированием абзаца; шрифты
// смешаны (Times New Roman / Arial / Calibri).
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import { BASE_SIZE } from "../common";
import { countInParts, finalize } from "../inject";
import type { DocBuildResult } from "./types";

function fakeHeading(text: string, font = "Times New Roman"): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
    children: [new TextRun({ text: text.toUpperCase(), font, size: BASE_SIZE + 4, bold: true })],
  });
}

function plainPara(text: string, font = "Times New Roman"): Paragraph {
  return new Paragraph({ spacing: { after: 120, line: 360 }, children: [new TextRun({ text, font, size: BASE_SIZE })] });
}

function indentedPara(text: string, indentTwips: number, font = "Times New Roman"): Paragraph {
  return new Paragraph({
    indent: { firstLine: indentTwips },
    spacing: { after: 120, line: 360 },
    children: [new TextRun({ text, font, size: BASE_SIZE })],
  });
}

export async function build(): Promise<DocBuildResult> {
  const children = [
    fakeHeading("Условное образовательное учреждение", "Arial"),
    fakeHeading("Реферат без применения стилей"),
    plainPara("Автор: синтетическое имя. Год: 2026.", "Calibri"),

    fakeHeading("Содержание"),
    plainPara("Введение — 3"),
    plainPara("1 Обзор предметной области — 4"),
    plainPara("Заключение — 6"),
    plainPara("Список использованных источников — 7"),

    fakeHeading("Введение"),
    indentedPara(
      "Настоящий реферат оформлен без использования именованных абзацных стилей: все заголовки набраны прямым форматированием (жирный, прописные, по центру), а не через встроенные уровни заголовков.",
      720,
    ),
    indentedPara("Такой способ оформления часто встречается в работах, подготовленных не в полнофункциональном Word, а в упрощённых редакторах.", 720),

    fakeHeading("1 Обзор предметной области"),
    indentedPara("Ниже приведён список пунктов, маркированный вручную дефисом, без применения нумерованных списков Word.", 720),
    plainPara("— Первый пункт, оформленный вручную."),
    plainPara("— Второй пункт, оформленный вручную."),
    plainPara("— Третий пункт, оформленный вручную."),
    indentedPara("Ниже приведён список пунктов с ручной нумерацией через набранный текст «N. ».", 720),
    plainPara("1. Первый пункт вручную пронумерованного списка."),
    plainPara("2. Второй пункт вручную пронумерованного списка."),
    plainPara("3. Третий пункт вручную пронумерованного списка.", "Arial"),

    fakeHeading("Заключение"),
    indentedPara("В работе рассмотрен способ оформления документа без применения стилей абзацев и списков Word.", 720),

    fakeHeading("Список использованных источников"),
    plainPara("1. Автор Ф. И. Название работы. — Город : Изд-во, 2020. — 100 с."),
    plainPara("2. Автор Ф. И. Название статьи // Журнал. — 2021. — № 2. — С. 3–9."),
  ];

  const doc = new Document({
    creator: "Un-named",
    sections: [{ properties: {}, children }],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const mustSurvive = {
    "w:pStyle": await countInParts(buffer, ["word/document.xml"], /<w:pStyle\b/g),
    "manual-numbered-markers": await countInParts(buffer, ["word/document.xml"], /<w:t[^>]*>\d+\. /g),
    "manual-dash-markers": await countInParts(buffer, ["word/document.xml"], /<w:t[^>]*>— /g),
  };

  return { file: "12-no-styles.docx", hazard: "no-styles (direct formatting only)", buffer, mustSurvive };
}
