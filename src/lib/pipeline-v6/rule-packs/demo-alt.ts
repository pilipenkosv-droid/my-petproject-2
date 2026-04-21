// Demo non-GOST rule pack. Используется для e2e-теста, что pipeline действительно
// параметризуется rulePack'ом, а не хардкодит ГОСТ-значения. Не продовый шаблон.

import type { RulePack } from "./types";

export const DEMO_ALT: RulePack = {
  id: "demo-alt",
  slug: "demo-alt",
  name: "Demo non-GOST (для теста параметризации)",
  referenceDocPath: "templates/reference-demo-alt.docx",
  values: {
    margins: { top: 25, bottom: 25, left: 25, right: 15 },
    fontFamily: "Arial",
    fontSize: 12,
    lineSpacing: 1.0,
    paragraphIndent: 10,
    tocTitle: "ОГЛАВЛЕНИЕ",
    bibliographyStyle: "gost-7.1",
    headingNumbering: "decimal",
  },
};
