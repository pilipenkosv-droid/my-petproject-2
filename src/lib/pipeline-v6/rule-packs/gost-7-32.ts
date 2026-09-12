// Seed rule pack — ГОСТ 7.32. Значения дублируют DEFAULT_GOST_RULES из
// src/types/formatting-rules.ts в формате RulePack. Когда все 30 checker-правил
// переведены на rulePack.values, старый DEFAULT_GOST_RULES можно будет удалить.

import type { HeadingSpec, RulePack } from "./types";

const heading = (over: Partial<HeadingSpec>): HeadingSpec => ({
  bold: true,
  caps: false,
  align: "left",
  sizePt: 14,
  spaceBeforePt: 12,
  spaceAfterPt: 12,
  pageBreakBefore: false,
  firstLineIndentMm: 12.5,
  ...over,
});

export const GOST_7_32: RulePack = {
  id: "gost-7-32",
  slug: "gost-7.32",
  name: "ГОСТ 7.32",
  referenceDocPath: "scripts/pipeline-v6/spike-pandoc/reference-gost.docx",
  values: {
    margins: { top: 20, bottom: 20, left: 30, right: 10 },
    fontFamily: "Times New Roman",
    fontSize: 14,
    lineSpacing: 1.5,
    paragraphIndent: 12.5,
    tocTitle: "СОДЕРЖАНИЕ",
    bibliographyStyle: "gost-7.1",
    headingNumbering: "gost",

    // ГОСТ 7.32-2017: заголовки разделов — с абзацного отступа, полужирные,
    // без точки в конце; разделы начинаются с новой страницы.
    pageSize: { w: 210, h: 297 },
    headings: {
      1: heading({ pageBreakBefore: true }),
      2: heading({}),
      3: heading({}),
    },
    // Подпись рисунка — по центру, подпись таблицы — слева над таблицей.
    caption: { align: "center", sizePt: 14, italic: false, tableAlign: "left" },
    tableCell: { sizePt: 12, lineSpacing: 1.0 },
    bibliography: { hangingIndentMm: 0 },
  },
};
