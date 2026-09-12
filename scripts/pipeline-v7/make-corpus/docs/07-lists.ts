// Хазард: маркированный список; 3-уровневый нумерованный; второй нумерованный
// список, рестартующий с 1 (отдельный numId — docx-lib сам делает
// startOverride=1 для каждого нового reference).
import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import { BASE_SIZE, FONT, buildGostShell } from "../common";
import { countInParts, finalize, loadZip, readText } from "../inject";
import type { DocBuildResult } from "./types";

function item(text: string, reference: string, level: number): Paragraph {
  return new Paragraph({ numbering: { reference, level }, children: [new TextRun({ text, font: FONT, size: BASE_SIZE })] });
}

export async function build(): Promise<DocBuildResult> {
  const chapterBody = [
    item("Первый пункт маркированного списка", "bulleted", 0),
    item("Второй пункт маркированного списка", "bulleted", 0),
    item("Третий пункт маркированного списка", "bulleted", 0),
    item("Первый пункт основного списка", "numbered-main", 0),
    item("Подпункт первого уровня вложенности", "numbered-main", 1),
    item("Подпункт второго уровня вложенности", "numbered-main", 2),
    item("Второй пункт основного списка", "numbered-main", 0),
    item("Первый пункт нового списка (рестарт нумерации)", "numbered-restart", 0),
    item("Второй пункт нового списка", "numbered-restart", 0),
  ];

  const doc = new Document({
    creator: "Un-named",
    numbering: {
      config: [
        {
          reference: "bulleted",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT }],
        },
        {
          reference: "numbered-main",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT },
            { level: 1, format: LevelFormat.DECIMAL, text: "%1.%2.", alignment: AlignmentType.LEFT },
            { level: 2, format: LevelFormat.LOWER_LETTER, text: "%3)", alignment: AlignmentType.LEFT },
          ],
        },
        {
          reference: "numbered-restart",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT }],
        },
      ],
    },
    sections: [{ properties: {}, children: buildGostShell({ title: "Списки: маркированный, многоуровневый, с рестартом", chapterBody }) }],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));

  const numPrCount = await countInParts(buffer, ["word/document.xml"], /<w:numPr>/g);
  const zip = await loadZip(buffer);
  const documentXml = await readText(zip, "word/document.xml");
  const numIdsUsed = new Set((documentXml.match(/<w:numId w:val="(\d+)"\/>/g) ?? []).map((m) => m.match(/\d+/)![0]));
  const numberingXml = await readText(zip, "word/numbering.xml");
  const numIdsDefined = new Set((numberingXml.match(/<w:num w:numId="(\d+)"/g) ?? []).map((m) => m.match(/\d+/)![0]));
  const unresolved = [...numIdsUsed].filter((id) => !numIdsDefined.has(id));
  if (unresolved.length > 0) {
    throw new Error(`numbering.xml does not define numId(s) used in document.xml: ${unresolved.join(", ")}`);
  }

  const mustSurvive = {
    "w:numPr": numPrCount,
    "distinct-numId": numIdsUsed.size,
  };

  return { file: "07-lists.docx", hazard: "lists (bullet+multilevel+restart)", buffer, mustSurvive };
}
