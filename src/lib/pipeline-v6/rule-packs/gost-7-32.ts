// Seed rule pack — ГОСТ 7.32. Значения дублируют DEFAULT_GOST_RULES из
// src/types/formatting-rules.ts в формате RulePack. Когда все 30 checker-правил
// переведены на rulePack.values, старый DEFAULT_GOST_RULES можно будет удалить.

import type { RulePack } from "./types";

export const GOST_7_32: RulePack = {
  id: "gost-7-32",
  slug: "gost-7.32",
  name: "ГОСТ 7.32",
  values: {
    margins: { top: 20, bottom: 20, left: 30, right: 10 },
    fontFamily: "Times New Roman",
    fontSize: 14,
    lineSpacing: 1.5,
    paragraphIndent: 12.5,
    tocTitle: "СОДЕРЖАНИЕ",
    bibliographyStyle: "gost-7.1",
    headingNumbering: "gost",
  },
};
