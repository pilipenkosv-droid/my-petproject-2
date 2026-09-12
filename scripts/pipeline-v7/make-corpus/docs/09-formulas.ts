// Хазард: 6 формул OMML — 2 инлайн внутри предложения, 4 отдельными
// параграфами. `docx` нативно генерирует m:oMath через Math/MathRun/
// MathFraction/MathSuperScript — инъекция не потребовалась.
import { AlignmentType, Document, Math, MathFraction, MathRun, MathSuperScript, Packer, Paragraph, TextRun } from "docx";
import { BASE_SIZE, FONT, buildGostShell } from "../common";
import { countInParts, finalize } from "../inject";
import type { DocBuildResult } from "./types";

function run(text: string): TextRun {
  return new TextRun({ text, font: FONT, size: BASE_SIZE });
}

function displayFormula(children: ConstructorParameters<typeof Math>[0]["children"]): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [new Math({ children })] });
}

export async function build(): Promise<DocBuildResult> {
  const chapterBody = [
    new Paragraph({
      children: [
        run("Скорость сходимости оценивается величиной "),
        new Math({ children: [new MathRun("x")] }),
        run(", а погрешность — величиной "),
        new Math({ children: [new MathSuperScript({ children: [new MathRun("ε")], superScript: [new MathRun("2")] })] }),
        run(", как показано ниже."),
      ],
    }),
    displayFormula([new MathFraction({ numerator: [new MathRun("a+b")], denominator: [new MathRun("c")] })]),
    displayFormula([new MathRun("y=kx+b")]),
    displayFormula([new MathSuperScript({ children: [new MathRun("x")], superScript: [new MathRun("n")] })]),
    displayFormula([new MathFraction({ numerator: [new MathRun("1")], denominator: [new MathRun("n")] }), new MathRun("·Σx")]),
  ];

  const doc = new Document({
    creator: "Un-named",
    sections: [{ properties: {}, children: buildGostShell({ title: "Формулы OMML", chapterBody }) }],
  });

  const buffer = await finalize(await Packer.toBuffer(doc));
  const mustSurvive = {
    "m:oMath": await countInParts(buffer, ["word/document.xml"], /<m:oMath>/g),
  };

  return { file: "09-formulas.docx", hazard: "formulas (OMML inline+display)", buffer, mustSurvive };
}
