import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import { candidatesForLlm } from "@/lib/pipeline-v7/classify/llm-candidates";
import type { ClassificationResult, Role } from "@/lib/pipeline-v7/classify/types";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { miniPackage, p, style, type MiniDocxParts } from "./helpers/mini-docx";

/** Plain sentences, so the suspect guard never fires on a two-paragraph test. */
const filler = (n = 12) =>
  Array.from({ length: n }, (_, i) => p(`Обычное предложение номер ${i + 1} в основном тексте.`)).join("");

/** Everything sits after a lead heading, out of reach of the title-page pass. */
const LEAD = p("ВВЕДЕНИЕ");

async function classify(parts: MiniDocxParts): Promise<ClassificationResult> {
  return classifyDocument(await miniPackage(parts));
}

function roleOf(result: ClassificationResult, text: string): Role | undefined {
  return result.list.find((cp) => cp.text === text)?.role;
}

async function roleOfProbe(probe: string, text: string, extra: Partial<MiniDocxParts> = {}) {
  const result = await classify({ body: LEAD + probe + filler(), ...extra });
  return { result, role: roleOf(result, text) };
}

describe("T0 — outline level and style cascade", () => {
  it("maps w:outlineLvl to heading levels and caps at L3", async () => {
    const body =
      LEAD +
      p("Первый", '<w:outlineLvl w:val="0"/>') +
      p("Второй", '<w:outlineLvl w:val="1"/>') +
      p("Третий", '<w:outlineLvl w:val="2"/>') +
      p("Глубокий", '<w:outlineLvl w:val="5"/>') +
      filler();
    const r = await classify({ body });
    expect(roleOf(r, "Первый")).toBe("heading_L1");
    expect(roleOf(r, "Второй")).toBe("heading_L2");
    expect(roleOf(r, "Третий")).toBe("heading_L3");
    expect(roleOf(r, "Глубокий")).toBe("heading_L3");
    expect(r.list.find((cp) => cp.text === "Первый")?.source).toBe("outlineLvl");
  });

  it.each([
    ["Heading1", "Heading 1", "heading_L1"],
    ["Heading_20_2", "Heading 2", "heading_L2"],
    ["a1", "Заголовок 1", "heading_L1"],
    ["Title", "Title", "heading_L1"],
    ["Subtitle", "Subtitle", "heading_L2"],
  ])("recognises style %s / %s as %s", async (id, name, expected) => {
    const { role } = await roleOfProbe(p("Текст", `<w:pStyle w:val="${id}"/>`), "Текст", {
      styles: style(id, name),
    });
    expect(role).toBe(expected);
  });

  it("follows w:basedOn up to a heading ancestor", async () => {
    const styles =
      style("Heading1", "Heading 1", '<w:pPr><w:outlineLvl w:val="0"/></w:pPr>') +
      style("MyChapter", "My Chapter", '<w:basedOn w:val="Heading1"/>') +
      style("MyChapterAlt", "Alt", '<w:basedOn w:val="MyChapter"/>');
    const { role } = await roleOfProbe(p("Глава", '<w:pStyle w:val="MyChapterAlt"/>'), "Глава", { styles });
    expect(role).toBe("heading_L1");
  });

  it("survives a w:basedOn cycle", async () => {
    const styles =
      style("A", "A", '<w:basedOn w:val="B"/>') + style("B", "B", '<w:basedOn w:val="A"/>');
    const { role } = await roleOfProbe(p("Циклический", '<w:pStyle w:val="A"/>'), "Циклический", { styles });
    expect(role).toBe("unknown");
  });

  it("maps TOC styles to toc and caption styles to a caption", async () => {
    const styles = style("TOC1", "toc 1") + style("Caption", "caption");
    const body =
      LEAD +
      p("Введение 3", '<w:pStyle w:val="TOC1"/>') +
      p("Схема установки", '<w:pStyle w:val="Caption"/>') +
      p("Таблица 2 — Результаты", '<w:pStyle w:val="Caption"/>') +
      filler();
    const r = await classify({ body, styles });
    expect(roleOf(r, "Введение 3")).toBe("toc");
    expect(roleOf(r, "Схема установки")).toBe("figure_caption");
    expect(roleOf(r, "Таблица 2 — Результаты")).toBe("table_caption");
  });
});

describe("T0 — numbering, position, captions", () => {
  const numbering =
    '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>' +
    '<w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:pStyle w:val="Heading1"/></w:lvl>' +
    '<w:lvl w:ilvl="1"><w:pStyle w:val="Heading2"/></w:lvl></w:abstractNum>' +
    '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>' +
    '<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>';
  const styles =
    style("Heading1", "Heading 1", '<w:pPr><w:outlineLvl w:val="0"/></w:pPr>') +
    style("Heading2", "Heading 2", '<w:pPr><w:outlineLvl w:val="1"/></w:pPr>');
  const numPr = (numId: string, ilvl = 0) =>
    `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`;

  it("separates a plain list item from a heading-linked numbering", async () => {
    const body =
      LEAD + p("Пункт списка", numPr("1")) + p("Нумерованный раздел", numPr("2", 1)) + filler();
    const r = await classify({ body, styles, numbering });
    expect(roleOf(r, "Пункт списка")).toBe("list_item");
    expect(roleOf(r, "Нумерованный раздел")).toBe("heading_L2");
  });

  it("classifies by position: table cell, footnote, header", async () => {
    const r = await classify({
      body: LEAD + `<w:tbl><w:tr><w:tc>${p("Ячейка")}</w:tc></w:tr></w:tbl>` + filler(),
      footnotes: `<w:footnote w:id="1">${p("Сноска")}</w:footnote>`,
      header: p("Колонтитул"),
    });
    expect(roleOf(r, "Ячейка")).toBe("table_cell");
    expect(roleOf(r, "Сноска")).toBe("note");
    expect(roleOf(r, "Колонтитул")).toBe("header_footer");
  });

  it("matches captions and rejects a sentence that merely mentions a table", async () => {
    const body =
      LEAD +
      p("Таблица 1.2 — Показатели") +
      p("Рисунок 4 — Схема") +
      p("Таблица 7") +
      p("Таблица 3 показывает распределение значений по группам респондентов.") +
      filler();
    const r = await classify({ body });
    expect(roleOf(r, "Таблица 1.2 — Показатели")).toBe("table_caption");
    expect(roleOf(r, "Рисунок 4 — Схема")).toBe("figure_caption");
    expect(roleOf(r, "Таблица 7")).toBe("table_caption");
    expect(roleOf(r, "Таблица 3 показывает распределение значений по группам респондентов.")).toBe(
      "unknown"
    );
  });
});

describe("T0 — text rules", () => {
  it("recognises ГОСТ section names, TOC names and appendices", async () => {
    const body =
      LEAD +
      p("ЗАКЛЮЧЕНИЕ") +
      p("ОГЛАВЛЕНИЕ") +
      p("ПРИЛОЖЕНИЕ А") +
      p("ОБОЗНАЧЕНИЯ И СОКРАЩЕНИЯ") +
      filler();
    const r = await classify({ body });
    expect(roleOf(r, "ЗАКЛЮЧЕНИЕ")).toBe("heading_L1");
    expect(roleOf(r, "ОГЛАВЛЕНИЕ")).toBe("toc");
    expect(roleOf(r, "ПРИЛОЖЕНИЕ А")).toBe("appendix_heading");
    expect(roleOf(r, "ОБОЗНАЧЕНИЯ И СОКРАЩЕНИЯ")).toBe("heading_L1");
  });

  it("accepts numbered headings and rejects sentences and long lines", async () => {
    const long = `2.1 ${"очень длинный заголовок ".repeat(8)}`.trim();
    const body =
      LEAD +
      p("1 Теоретические основы") +
      p("1.2 Методы исследования") +
      p("1. Это обычное предложение, которое заканчивается точкой.") +
      p("1.2.3.4 Слишком глубокая нумерация") +
      p(long) +
      filler();
    const r = await classify({ body });
    expect(roleOf(r, "1 Теоретические основы")).toBe("heading_L1");
    expect(roleOf(r, "1.2 Методы исследования")).toBe("heading_L2");
    expect(roleOf(r, "1. Это обычное предложение, которое заканчивается точкой.")).toBe("unknown");
    expect(roleOf(r, "1.2.3.4 Слишком глубокая нумерация")).toBe("unknown");
    expect(roleOf(r, long)).toBe("unknown");
  });

  it("leaves a bold sentence as unknown — boldness alone is not a heading", async () => {
    const { role } = await roleOfProbe(
      p("Результаты эксперимента подтверждают исходную гипотезу", "", "<w:rPr><w:b/></w:rPr>"),
      "Результаты эксперимента подтверждают исходную гипотезу"
    );
    expect(role).toBe("unknown");
  });

  it("marks empty paragraphs and formulas", async () => {
    const math = `<w:p><m:oMath><m:r><m:t>x=y</m:t></m:r></m:oMath></w:p>`;
    const inline = `<w:p><w:r><w:t>${"Формула в тексте описывает связь величин"}</w:t></w:r><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>`;
    const r = await classify({ body: LEAD + p("") + math + inline + filler() });
    expect(r.histogram.empty).toBeGreaterThan(0);
    expect(r.histogram.formula).toBe(1);
    const long = r.list.find((cp) => cp.text?.startsWith("Формула в тексте"));
    expect(long?.role).toBe("body");
    expect(long?.hasInlineMath).toBe(true);
  });
});

describe("T0 — region and coherence passes", () => {
  it("turns paragraphs after a bibliography heading into bibliography items", async () => {
    const body =
      LEAD +
      filler(3) +
      p("СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ") +
      p("Иванов И. И. Теория систем. — М.: Наука, 2019. — 320 с.") +
      p("ПРИЛОЖЕНИЕ Б") +
      p("После приложения обычный текст, не источник.") +
      filler(8);
    const r = await classify({ body });
    expect(roleOf(r, "Иванов И. И. Теория систем. — М.: Наука, 2019. — 320 с.")).toBe(
      "bibliography_item"
    );
    expect(roleOf(r, "После приложения обычный текст, не источник.")).not.toBe("bibliography_item");
  });

  it("labels the run-up to the first heading as the title page and caps it", async () => {
    const before = Array.from({ length: 50 }, (_, i) => p(`Титул ${i}`)).join("");
    const r = await classify({ body: before + p("ВВЕДЕНИЕ") + filler(60) });
    expect(r.histogram.title_page).toBe(40);
    expect(roleOf(r, "Титул 45")).toBe("unknown");
  });

  it("stops the title page at an explicit page break", async () => {
    const brk = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    const r = await classify({ body: p("Титул") + brk + filler(30) + p("ВВЕДЕНИЕ") });
    // The break paragraph itself stays `empty`: the pass only relabels unknown/body.
    expect(r.histogram.title_page).toBe(1);
    expect(roleOf(r, "Обычное предложение номер 1 в основном тексте.")).toBe("unknown");
  });

  it("demotes a heading that jumps more than one level", async () => {
    const body =
      p("1 Первый раздел") + p("1.1.1 Подраздел третьего уровня") + filler(20);
    const r = await classify({ body });
    expect(roleOf(r, "1.1.1 Подраздел третьего уровня")).toBe("heading_L2");
    expect(r.warnings.some((w) => w.includes("coherence"))).toBe(true);
  });

  it("flags a heading-heavy document as suspect and demotes guessed headings", async () => {
    const guessed = Array.from({ length: 10 }, (_, i) => p(`${i + 1} Раздел про что-то`)).join("");
    const styled = p("Настоящий заголовок", '<w:outlineLvl w:val="0"/>');
    const r = await classify({ body: styled + guessed + p("Одно предложение текста.") });
    expect(r.suspect).toBe(true);
    expect(roleOf(r, "1 Раздел про что-то")).toBe("unknown");
    expect(roleOf(r, "Настоящий заголовок")).toBe("heading_L1");
    expect(r.warnings.some((w) => w.includes("suspect"))).toBe(true);
  });
});

describe("candidatesForLlm", () => {
  it("keeps formatted unknowns and drops plain sentences", async () => {
    const centred = p("Методика оценки", '<w:jc w:val="center"/>', "<w:rPr><w:b/></w:rPr>");
    const r = await classify({ body: LEAD + centred + filler() });
    const texts = candidatesForLlm(r).map((c) => c.text);
    expect(texts).toContain("Методика оценки");
    expect(texts.some((t) => t?.startsWith("Обычное предложение"))).toBe(false);
  });

  it("returns nothing when every paragraph is decided with high confidence", async () => {
    const r = await classify({ body: p("Ячейка") });
    expect(candidatesForLlm(r).every((c) => c.confidence < 0.85 || c.role === "unknown")).toBe(true);
  });
});

const REAL_DIR = "/Users/sergejpilipenko/diplox/data/corpus/real";
const SYNTH_DIR = path.resolve(__dirname, "../../../data/corpus/synthetic");

function listDocx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".docx") && !f.startsWith("~$"))
    .map((f) => path.join(dir, f));
}

for (const [label, dir] of [["real", REAL_DIR], ["synthetic", SYNTH_DIR]] as const) {
  const files = listDocx(dir);
  describe.skipIf(files.length === 0)(`classify smoke — ${label} corpus`, () => {
    it("classifies every document quickly and non-trivially", async () => {
      let suspects = 0;
      for (const file of files) {
        const pkg = await DocxPackage.load(fs.readFileSync(file));
        const started = Date.now();
        const r = await classifyDocument(pkg);
        const elapsed = Date.now() - started;
        expect(elapsed, `${path.basename(file)} took ${elapsed}ms`).toBeLessThan(2000);
        expect(r.list.length, path.basename(file)).toBeGreaterThan(0);
        if (r.suspect) suspects += 1;
      }
      console.log(`[classify smoke] ${label}: ${suspects}/${files.length} suspect`);
    });
  });
}
