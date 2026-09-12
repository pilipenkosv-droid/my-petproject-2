import { describe, it, expect } from "vitest";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { ROLES } from "@/lib/pipeline-v7/classify/types";
import { FidelityGateError } from "@/lib/pipeline-v7/fingerprint/gate";
import { restyleDocument } from "@/lib/pipeline-v7/restyle";
import { ROLE_TO_BLOCK_TYPE, runPipelineV7 } from "@/lib/pipeline-v7/orchestrator";
import { formatReportText, toJson } from "@/lib/pipeline-v7/report";
import { blockTypeSchema } from "@/lib/ai/block-markup-schemas";
import { children, findChild } from "@/lib/xml/docx-xml";
import { buildMiniDocx, p } from "./helpers/mini-docx";

const BODY =
  p("ВВЕДЕНИЕ", `<w:outlineLvl w:val="0"/>`) +
  p("Первый абзац основного текста работы.") +
  p("Второй абзац основного текста работы.") +
  `<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr></w:p>`;

const doc = () => buildMiniDocx({ body: BODY, styles: "" });

/** Restyle wrapper that drops the last body paragraph — a fidelity violation. */
const deletingRestyle: typeof restyleDocument = async (pkg, pack, classification) => {
  const stats = await restyleDocument(pkg, pack, classification);
  const nodes = await pkg.part("word/document.xml");
  const root = nodes?.find((n) => "w:document" in n);
  const body = root ? findChild(root, "w:body") : undefined;
  const kids = body ? children(body) : [];
  const hasSectPr = (n: (typeof kids)[number]) => {
    const pPr = findChild(n, "w:pPr");
    return pPr !== undefined && findChild(pPr, "w:sectPr") !== undefined;
  };
  const lastP = [...kids].reverse().find((n) => "w:p" in n && !hasSectPr(n));
  if (lastP) kids.splice(kids.indexOf(lastP), 1);
  pkg.markDirty("word/document.xml");
  return stats;
};

describe("runPipelineV7", () => {
  it("проходит гейт и возвращает буфер на чистом документе", async () => {
    const result = await runPipelineV7(await doc(), { pack: GOST_7_32, documentId: "mini" });
    expect(result.report.gate.pass).toBe(true);
    expect(result.report.gate.violations).toEqual([]);
    expect(result.output).toBeInstanceOf(Buffer);
    expect(result.output!.length).toBeGreaterThan(0);
    expect(result.report.restyle.paragraphsTouched).toBeGreaterThan(0);
  });

  it("бросает FidelityGateError и не отдаёт буфер, если абзац потерян", async () => {
    await expect(
      runPipelineV7(await doc(), { pack: GOST_7_32, restyleImpl: deletingRestyle })
    ).rejects.toBeInstanceOf(FidelityGateError);
  });

  it("returnOnGateFail отдаёт diff вместо исключения", async () => {
    const result = await runPipelineV7(await doc(), {
      pack: GOST_7_32,
      restyleImpl: deletingRestyle,
      returnOnGateFail: true,
    });
    expect(result.output).toBeUndefined();
    expect(result.report.gate.pass).toBe(false);
    expect(result.report.gate.violations.length).toBeGreaterThan(0);
    expect(result.report.gate.diff.entries.length).toBeGreaterThan(0);
  });

  it("отчёт содержит все ключи таймингов и рендерится без текста абзацев", async () => {
    const { report } = await runPipelineV7(await doc(), { pack: GOST_7_32, documentId: "mini" });
    expect(Object.keys(report.timings).sort()).toEqual(
      [
        "auxMs",
        "checkerMs",
        "classifyMs",
        "fingerprintAfterMs",
        "fingerprintBeforeMs",
        "gateMs",
        "restyleMs",
        "saveMs",
        "totalMs",
      ].sort()
    );
    const json = JSON.parse(toJson(report));
    expect(json.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(json.classification.histogram).toBeDefined();
    const text = formatReportText(report);
    expect(text).not.toContain("Первый абзац основного текста");
  });

  it("карта Role → BlockType покрывает все роли валидными значениями", () => {
    for (const role of ROLES) {
      expect(ROLE_TO_BLOCK_TYPE[role], `нет отображения для ${role}`).toBeDefined();
      expect(() => blockTypeSchema.parse(ROLE_TO_BLOCK_TYPE[role])).not.toThrow();
    }
    expect(Object.keys(ROLE_TO_BLOCK_TYPE).sort()).toEqual([...ROLES].sort());
  });
});
