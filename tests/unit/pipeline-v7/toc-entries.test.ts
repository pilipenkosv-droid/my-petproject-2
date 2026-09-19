/**
 * A7: recognising a table of contents the student typed by hand.
 *
 * T0 has no style to go on, so the evidence is the shape of the line — which
 * is only safe inside the region under the «СОДЕРЖАНИЕ» heading. Both halves
 * are tested here: that the region opens and closes where it should, and that
 * a recognised line reaches the output with the style the checker looks for.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { runPipelineV7 } from "@/lib/pipeline-v7/orchestrator";
import { applyTocRegion } from "@/lib/pipeline-v7/classify/passes";
import { isTocEntry } from "@/lib/pipeline-v7/classify/patterns";
import type { ClassifiedParagraph, Role } from "@/lib/pipeline-v7/classify/types";
import { buildMiniDocx, p, style, W_NS } from "./helpers/mini-docx";

const SECT = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:left="1701"/></w:sectPr>`;
const STYLES = style("Heading1", "heading 1") + style("Normal", "Normal");
const H1 = (t: string) => p(t, `<w:pStyle w:val="Heading1"/>`);
const filler = (n = 22) =>
  Array.from({ length: n }, (_, i) => p(`Обычное предложение номер ${i + 1} в основном тексте.`)).join("");

/** A minimal classified list: role and text are all the pass reads. */
const cp = (text: string, role: Role = "unknown"): ClassifiedParagraph =>
  ({ node: {} as never, path: "p", part: "word/document.xml", role, confidence: 0, source: "none", text }) as ClassifiedParagraph;

describe("classify/patterns — форма строки оглавления", () => {
  it("узнаёт точки-лидеры и номер страницы", () => {
    expect(isTocEntry("Введение .........................................")).toBe(true);
    expect(isTocEntry("1.1 Постановка задачи ...... 5")).toBe(true);
    expect(isTocEntry("Введение — 3")).toBe(true);
    expect(isTocEntry("Заключение 20")).toBe(true);
  });

  it("не узнаёт обычное предложение", () => {
    expect(isTocEntry("Настоящий реферат оформлен без именованных стилей.")).toBe(false);
    expect(isTocEntry("")).toBe(false);
  });
});

describe("classify/passes — область оглавления", () => {
  it("помечает строки под «СОДЕРЖАНИЕ» и закрывается на следующем заголовке", () => {
    const list = [
      cp("Титульный лист", "title_page"),
      cp("СОДЕРЖАНИЕ", "heading_L1"),
      cp("Введение ......... 3"),
      cp("1 Обзор ......... 4"),
      cp("ВВЕДЕНИЕ", "heading_L1"),
      cp("Работа выполнена в 2026"),
    ];
    applyTocRegion(list, 0, list.length);
    expect(list.map((c) => c.role)).toEqual([
      "title_page", "heading_L1", "toc", "toc", "heading_L1", "unknown",
    ]);
    expect(list[2].source).toBe("toc-entry");
    expect(list[2].confidence).toBe(0.9);
  });

  it("не трогает ничего без заголовка «СОДЕРЖАНИЕ»", () => {
    const list = [cp("Введение ......... 3"), cp("1 Обзор ......... 4")];
    applyTocRegion(list, 0, list.length);
    expect(list.every((c) => c.role === "unknown")).toBe(true);
  });

  it("не перебивает роль, которую T0 доказал по файлу", () => {
    const list = [cp("СОДЕРЖАНИЕ", "toc"), cp("Таблица 1 — Данные 5", "table_caption")];
    applyTocRegion(list, 0, list.length);
    expect(list[1].role).toBe("table_caption");
  });
});

describe("pipeline — набранное руками оглавление доходит до выхода", () => {
  const body =
    p("Титульный лист") +
    p("Курсовая работа") +
    p("Москва 2026") +
    H1("СОДЕРЖАНИЕ") +
    p("Введение ......................... 3") +
    p("1 Обзор предметной области ....... 4") +
    p("Заключение ....................... 20") +
    H1("ВВЕДЕНИЕ") +
    p("Текст работы.") +
    filler() +
    H1("ЗАКЛЮЧЕНИЕ") +
    p("Итоги.") +
    SECT;

  it("строки получают TOC1, заголовок — нет, гейт проходит", async () => {
    const r = await runPipelineV7(await buildMiniDocx({ body, styles: STYLES }), {
      pack: GOST_7_32,
      documentId: "toc-entries",
      returnOnGateFail: true,
      textNormalization: true,
    });
    expect(r.report.gate.pass).toBe(true);
    expect(r.report.classification.histogram.toc).toBe(3);

    const xml = await (await JSZip.loadAsync(r.output!)).file("word/document.xml")!.async("string");
    expect(xml.match(/w:pStyle w:val="TOC1"/g)?.length).toBe(3);
    // Заголовок «СОДЕРЖАНИЕ» — это заголовок, а не строка перечня.
    expect(xml).toMatch(/w:pStyle w:val="DpxHeading1"[^]*?СОДЕРЖАНИЕ/);

    // Стиль объявлен, а не просто упомянут.
    const styles = await (await JSZip.loadAsync(r.output!)).file("word/styles.xml")!.async("string");
    expect(styles).toContain('w:styleId="TOC1"');

    // Чекер больше не считает документ бесоглавленным.
    expect(r.report.checker.failed).not.toContain("structure.tocFieldCode");
  });

  it("объявляет стиль с id ровно TOC1, даже если в документе уже есть «toc 1» под другим id", async () => {
    // Документы Word сплошь и рядом несут стиль с именем «toc 1» под
    // сгенерированным id (11, 31). Поиск по имени нашёл бы его, стиля с id
    // TOC1 не появилось бы, и абзацы ссылались бы в пустоту — а чекер
    // сличает именно id.
    const foreign =
      '<w:style w:type="paragraph" w:styleId="11"><w:name w:val="toc 1"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="31"><w:name w:val="toc 3"/></w:style>';
    const r = await runPipelineV7(await buildMiniDocx({ body, styles: STYLES + foreign }), {
      pack: GOST_7_32,
      documentId: "toc-entries",
      returnOnGateFail: true,
      textNormalization: true,
    });
    const styles = await (await JSZip.loadAsync(r.output!)).file("word/styles.xml")!.async("string");
    expect(styles).toContain('w:styleId="TOC1"');
    // Чужой стиль остался на месте, его id не переписан.
    expect(styles).toContain('w:styleId="11"');
  });

  it("идемпотентен: второй прогон не меняет ни роли, ни оценку", async () => {
    const input = await buildMiniDocx({ body, styles: STYLES });
    const opts = {
      pack: GOST_7_32,
      documentId: "toc-entries",
      returnOnGateFail: true,
      textNormalization: true,
    };
    const first = await runPipelineV7(input, opts);
    const second = await runPipelineV7(first.output!, opts);
    expect(second.report.classification.histogram.toc).toBe(first.report.classification.histogram.toc);
    expect(second.report.checker.finalScoreUndef).toBe(first.report.checker.finalScoreUndef);
    expect(second.report.gate.pass).toBe(true);
  });

  it("текст строк не меняется: роль toc исключена из нормализации", async () => {
    const r = await runPipelineV7(await buildMiniDocx({ body, styles: STYLES }), {
      pack: GOST_7_32,
      documentId: "toc-entries",
      returnOnGateFail: true,
      textNormalization: true,
    });
    const xml = await (await JSZip.loadAsync(r.output!)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Введение ......................... 3");
  });
});
