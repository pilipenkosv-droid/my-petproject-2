/**
 * A1/A2: space runs and doubled dots across run boundaries.
 *
 * These exercise `normalizeText` directly on a parsed paragraph, because what
 * they are about is the walk — which `w:t` nodes are counted, which are
 * rewritten — and a whole-pipeline fixture hides that behind the gate.
 */

import { describe, it, expect } from "vitest";
import { normalizeText } from "@/lib/pipeline-v7/aux";
import { children, findChild, parseDocxXml, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { W_NS } from "./helpers/mini-docx";

/** Parses one `<w:p>` and hands it over as a one-paragraph classification. */
function para(inner: string, role: "body" | "toc" | "formula" = "body") {
  const node = findChild(
    parseDocxXml(`<w:root ${W_NS}><w:p>${inner}</w:p></w:root>`).find((n) => "w:root" in n)!,
    "w:p"
  )!;
  const cp = {
    node,
    path: "p",
    part: "word/document.xml",
    role,
    confidence: 1,
    source: "style" as const,
  };
  return {
    node,
    classification: {
      byNode: new WeakMap(),
      list: [cp],
      histogram: {} as never,
      warnings: [],
      suspect: false,
    },
  };
}

/**
 * The paragraph's joined text, with a break as `\n` and a tab as `\t` — the
 * view the module itself takes, so an assertion can say where a space sits
 * relative to a line break.
 */
function joined(node: OrderedXmlNode): string {
  let out = "";
  const walk = (n: OrderedXmlNode): void => {
    for (const child of children(n)) {
      const tag = Object.keys(child).find((k) => k !== ":@");
      if (tag === "w:t") {
        for (const h of children(child)) {
          if ("#text" in h) out += String((h as Record<string, unknown>)["#text"]);
        }
      } else if (tag === "w:br" || tag === "w:cr") out += "\n";
      else if (tag === "w:tab") out += "\t";
      else if (tag !== undefined && tag !== ":@") walk(child);
    }
  };
  walk(node);
  return out;
}

const run = (inner: string, role?: "body" | "toc" | "formula") => {
  const { node, classification } = para(inner, role);
  const stats = normalizeText(classification);
  return { text: joined(node), stats, node, classification };
};

const r = (t: string, space = false) =>
  `<w:r><w:t${space ? ' xml:space="preserve"' : ""}>${t}</w:t></w:r>`;

describe("aux/text-norm — пробелы и точки через границу run", () => {
  it("схлопывает пробел, разорванный между двумя run", () => {
    const { text, stats } = run(r("Текст ", true) + r(" продолжение", true));
    expect(text).toBe("Текст продолжение");
    expect(stats.spacesCollapsed).toBe(1);
  });

  it("схлопывает пробелы, размазанные по трём run", () => {
    const { text, stats } = run(r("Слово ", true) + r(" ", true) + r(" ещё", true));
    expect(text).toBe("Слово ещё");
    expect(stats.spacesCollapsed).toBe(1);
  });

  it("работает и внутри одного w:t, как раньше", () => {
    const { text, stats } = run(r("Текст  с  пробелами"));
    expect(text).toBe("Текст с пробелами");
    expect(stats.spacesCollapsed).toBe(2);
  });

  it("идемпотентен: второй проход ничего не меняет", () => {
    const { node, classification } = para(r("А  б", true) + r(" в", true) + r("..", true));
    normalizeText(classification);
    const once = joined(node);
    const second = normalizeText(classification);
    expect(joined(node)).toBe(once);
    expect(second.spacesCollapsed).toBe(0);
    expect(second.doubleDotsFixed).toBe(0);
  });

  it("чинит `..` внутри w:t, не трогая `...` и многоточие", () => {
    const { text, stats } = run(r("Конец.. Дальше... И ещё…"));
    expect(text).toBe("Конец. Дальше... И ещё…");
    expect(stats.doubleDotsFixed).toBe(1);
  });

  it("чинит `..` через границу run", () => {
    const { text, stats } = run(r("Предложение.") + r(". Следующее", true));
    expect(text).toBe("Предложение. Следующее");
    expect(stats.doubleDotsFixed).toBe(1);
  });

  it("не разрывает `...`, размазанное по run", () => {
    const { text, stats } = run(r("Мысль.") + r("..") + r(" дальше", true));
    expect(text).toBe("Мысль... дальше");
    expect(stats.doubleDotsFixed).toBe(0);
  });

  it("не трогает текст гиперссылки, но считает его в смещениях", () => {
    const { text } = run(
      r("До ", true) + `<w:hyperlink>${r("ссылка  внутри")}</w:hyperlink>` + r(" после", true)
    );
    // Двойной пробел внутри ссылки остался; пробел на её границе — схлопнут.
    expect(text).toBe("До ссылка  внутри после");
  });

  it("не трогает удалённый текст", () => {
    const { text } = run(r("Текст ", true) + `<w:del>${r(" удалено  два")}</w:del>`);
    expect(text).toBe("Текст  удалено  два");
  });

  it("не трогает run с полем", () => {
    const { text, stats } = run(
      `<w:r><w:fldChar w:fldCharType="begin"/><w:t xml:space="preserve">A  B</w:t></w:r>`
    );
    expect(text).toBe("A  B");
    expect(stats.spacesCollapsed).toBe(1); // найдено, но не переписано
  });

  it("пропускает роли toc и formula целиком", () => {
    expect(run(r("А  б"), "toc").text).toBe("А  б");
    expect(run(r("x  ..  y"), "formula").text).toBe("x  ..  y");
  });

  it("ставит xml:space=preserve, когда на краю остался пробел", () => {
    const { node } = para(r("Хвост  ") + r("голова", true));
    normalizeText({
      byNode: new WeakMap(),
      list: [
        { node, path: "p", part: "word/document.xml", role: "body" as const, confidence: 1, source: "style" as const },
      ],
      histogram: {} as never,
      warnings: [],
      suspect: false,
    });
    const first = findChild(children(node)[0], "w:t")!;
    expect(first[":@"]?.["@_xml:space"]).toBe("preserve");
  });
});

describe("aux/text-norm — разделители внутри run", () => {
  const br = `<w:r><w:br/></w:r>`;

  it("не склеивает пробелы по разные стороны переноса строки", () => {
    const { text, stats } = run(r("Первая строка ", true) + br + r(" Вторая строка", true));
    expect(text).toBe("Первая строка \n Вторая строка");
    expect(stats.spacesCollapsed).toBe(0);
  });

  it("не склеивает пробелы вокруг табуляции", () => {
    const { text } = run(r("Слева ", true) + `<w:r><w:tab/></w:r>` + r(" справа", true));
    expect(text).toBe("Слева \t справа");
  });

  it("всё ещё схлопывает настоящую пару по разные стороны границы run", () => {
    const { text, stats } = run(r("Слева ", true) + r(" справа", true));
    expect(text).toBe("Слева справа");
    expect(stats.spacesCollapsed).toBe(1);
  });
});
