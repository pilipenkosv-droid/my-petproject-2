// Хазард: 4 инлайн-изображения (2 с подписью «Рисунок N — …», 2 без) + 1
// плавающее (anchored) изображение. Итого 5 w:drawing и 5 файлов в media.
import { AlignmentType, Document, ImageRun, Packer, Paragraph, TextRun, VerticalPositionAlign, HorizontalPositionAlign, TextWrappingType } from "docx";
import { BASE_SIZE, FONT, bodyPara, buildGostShell } from "../common";
import { countInParts, finalize, listParts } from "../inject";
import { solidPng } from "../png";
import type { DocBuildResult } from "./types";

function caption(text: string): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: FONT, size: BASE_SIZE - 2, bold: true })] });
}

function inlineImagePara(png: Buffer): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ type: "png", data: png, transformation: { width: 96, height: 96 } })],
  });
}

export async function build(): Promise<DocBuildResult> {
  const img1 = solidPng(32, [200, 60, 60]);
  const img2 = solidPng(32, [60, 140, 60]);
  const img3 = solidPng(32, [60, 60, 200]);
  const img4 = solidPng(32, [180, 140, 40]);
  const img5 = solidPng(32, [120, 60, 180]);

  const floatingPara = new Paragraph({
    children: [
      new ImageRun({
        type: "png",
        data: img5,
        transformation: { width: 80, height: 80 },
        floating: {
          horizontalPosition: { align: HorizontalPositionAlign.RIGHT },
          verticalPosition: { align: VerticalPositionAlign.TOP },
          wrap: { type: TextWrappingType.SQUARE },
        },
      }),
    ],
  });

  const chapterBody = [
    inlineImagePara(img1),
    caption("Рисунок 1 — иллюстрация к пункту 1.2"),
    inlineImagePara(img2),
    caption("Рисунок 2 — иллюстрация к пункту 1.2"),
    inlineImagePara(img3),
    inlineImagePara(img4),
    bodyPara("Далее по тексту расположено плавающее (обтекаемое) изображение без подписи."),
    floatingPara,
    bodyPara("Абзац, продолжающий текст после плавающего изображения."),
  ];

  const doc = new Document({
    creator: "Un-named",
    sections: [{ properties: {}, children: buildGostShell({ title: "Изображения и подписи", chapterBody }) }],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const mediaFiles = await listParts(buffer, "word/media/");
  const mustSurvive = {
    "w:drawing": await countInParts(buffer, ["word/document.xml"], /<w:drawing>/g),
    "media-files": mediaFiles.length,
  };

  return { file: "08-images-captions.docx", hazard: "images+captions (inline+floating)", buffer, mustSurvive };
}
