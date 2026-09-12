// Хазард: настоящее поле TOC \o "1-3" \h \z \u + дерево заголовков + 4
// «кэшированные» записи результата (TOC1/TOC2), которых `docx`-lib не создаёт
// — Word сохраняет их между fldChar separate/end, поэтому инъекция через
// JSZip имитирует именно такой, «уже открывавшийся в Word», документ.
import { Document, Packer, TableOfContents } from "docx";
import { bibliographyHeading, buildGostShell, chapterHeading, conclusionSection, fillerParagraphs, introductionSection, shortBibliographyPlaceholder, subheading11, subheading12, titlePageParagraphs } from "../common";
import { countInParts, injectTocCachedEntries } from "../inject";
import type { TocCachedEntry } from "../inject";
import type { DocBuildResult } from "./types";

export async function build(): Promise<DocBuildResult> {
  const toc = new TableOfContents("Содержание", { hyperlink: true, headingStyleRange: "1-3", tcFieldLevelRange: "1-3" });

  const doc = new Document({
    creator: "Un-named",
    sections: [
      {
        properties: {},
        children: [
          ...titlePageParagraphs("Документ с существующим оглавлением", "КУРСОВАЯ РАБОТА"),
          toc,
          ...introductionSection(),
          chapterHeading(),
          subheading11(),
          ...fillerParagraphs(2, 0),
          subheading12(),
          ...fillerParagraphs(2, 2),
          ...conclusionSection(),
          bibliographyHeading(),
          ...shortBibliographyPlaceholder(),
        ],
      },
    ],
  });

  let buffer = await Packer.toBuffer(doc);

  const cachedEntries: TocCachedEntry[] = [
    { style: "TOC1", text: "Введение", page: 3 },
    { style: "TOC1", text: "1 Обзор предметной области", page: 4 },
    { style: "TOC2", text: "1.1 Постановка задачи", page: 4 },
    { style: "TOC2", text: "1.2 Анализ существующих решений", page: 5 },
  ];
  buffer = await injectTocCachedEntries(buffer, cachedEntries);

  const mustSurvive = {
    "instrText:TOC": await countInParts(buffer, ["word/document.xml"], /<w:instrText[^>]*>TOC /g),
    "toc-cached-entries": await countInParts(buffer, ["word/document.xml"], /<w:pStyle w:val="TOC[12]"\/>/g),
  };

  return { file: "10-existing-toc.docx", hazard: "existing-toc (cached field result)", buffer, mustSurvive };
}
