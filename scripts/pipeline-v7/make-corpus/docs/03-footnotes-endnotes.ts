// Хазард: 6 сносок (footnotes, нативно через docx-lib) + 3 концевые сноски
// (endnotes — docx-lib их не умеет, добавляются пост-билдом через inject.ts),
// две сноски на одном абзаце.
import { Document, FootnoteReferenceRun, Packer, Paragraph, TextRun } from "docx";
import { BASE_SIZE, FONT, bodyPara, buildGostShell, fillerText } from "../common";
import { countInParts, injectEndnotes } from "../inject";
import type { DocBuildResult } from "./types";
import type { EndnoteSpec } from "../inject";

function run(text: string): TextRun {
  return new TextRun({ text, font: FONT, size: BASE_SIZE });
}

export async function build(): Promise<DocBuildResult> {
  const endnoteSpecs: EndnoteSpec[] = [
    { id: 1, marker: "⟦EN:1⟧", text: "Концевая сноска 1 — синтетический источник." },
    { id: 2, marker: "⟦EN:2⟧", text: "Концевая сноска 2 — синтетический источник." },
    { id: 3, marker: "⟦EN:3⟧", text: "Концевая сноска 3 — синтетический источник." },
  ];

  const chapterBody = [
    // Абзац с двумя сносками подряд (footnote 1 и 2 на одном параграфе).
    new Paragraph({
      spacing: { after: 120, line: 360 },
      children: [
        run(fillerText(0)),
        new FootnoteReferenceRun(1),
        run(" Продолжение той же мысли в этом же абзаце."),
        new FootnoteReferenceRun(2),
      ],
    }),
    new Paragraph({
      spacing: { after: 120, line: 360 },
      children: [run(fillerText(1)), new FootnoteReferenceRun(3), run(" " + endnoteSpecs[0].marker)],
    }),
    new Paragraph({
      spacing: { after: 120, line: 360 },
      children: [run(fillerText(2)), new FootnoteReferenceRun(4), run(" " + endnoteSpecs[1].marker)],
    }),
    new Paragraph({
      spacing: { after: 120, line: 360 },
      children: [run(fillerText(3)), new FootnoteReferenceRun(5), run(" " + endnoteSpecs[2].marker)],
    }),
    new Paragraph({
      spacing: { after: 120, line: 360 },
      children: [run(fillerText(4)), new FootnoteReferenceRun(6)],
    }),
  ];

  const footnotes: Record<number, { children: Paragraph[] }> = {};
  for (let i = 1; i <= 6; i++) {
    footnotes[i] = { children: [bodyPara(`Сноска ${i} — синтетический комментарий к тексту.`)] };
  }

  const doc = new Document({
    creator: "Un-named",
    footnotes,
    sections: [{ properties: {}, children: buildGostShell({ title: "Сноски и концевые сноски", chapterBody }) }],
  });

  let buffer = await Packer.toBuffer(doc);
  buffer = await injectEndnotes(buffer, endnoteSpecs);

  const mustSurvive = {
    "w:footnoteReference": await countInParts(buffer, ["word/document.xml"], /<w:footnoteReference\b/g),
    "w:endnoteReference": await countInParts(buffer, ["word/document.xml"], /<w:endnoteReference\b/g),
  };

  return { file: "03-footnotes-endnotes.docx", hazard: "footnotes+endnotes", buffer, mustSurvive };
}
