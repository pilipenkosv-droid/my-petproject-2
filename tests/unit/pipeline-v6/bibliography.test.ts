import { describe, it, expect } from "vitest";
import {
  formatGostBibliography,
  formatGostEntry,
  type CslItem,
} from "../../../src/lib/pipeline-v6/bibliography/gost-formatter";

const book: CslItem = {
  id: "kovalev-2020",
  type: "book",
  title: "Основы теории систем",
  author: [{ family: "Ковалев", given: "Иван Петрович" }],
  "publisher-place": "Москва",
  publisher: "Наука",
  issued: { "date-parts": [[2020]] },
  "number-of-pages": 320,
  ISBN: "978-5-02-039876-5",
};

const article: CslItem = {
  id: "smirnov-2022",
  type: "article-journal",
  title: "Алгоритмы кластеризации",
  author: [{ family: "Смирнов", given: "А. В." }],
  "container-title": "Вестник МГУ",
  issued: { "date-parts": [[2022]] },
  volume: 15,
  issue: 3,
  page: "45-60",
};

const web: CslItem = {
  id: "gost-standard",
  type: "webpage",
  title: "ГОСТ 7.1-2003. Библиографическая запись",
  URL: "https://protect.gost.ru/document/",
  accessed: { "date-parts": [[2026, 4, 21]] },
};

describe("formatGostEntry", () => {
  it("formats a book per ГОСТ 7.1", () => {
    const text = formatGostEntry(book);
    expect(text).toContain("Ковалев, И. П.");
    expect(text).toContain("Основы теории систем");
    expect(text).toContain("Москва : Наука, 2020");
    expect(text).toContain("320 с.");
    expect(text).toContain("ISBN 978-5-02-039876-5");
  });

  it("formats journal article with // separator", () => {
    const text = formatGostEntry(article);
    expect(text).toContain("Смирнов, А. В.");
    expect(text).toContain("Алгоритмы кластеризации");
    expect(text).toContain("// Вестник МГУ");
    expect(text).toContain("2022");
    expect(text).toContain("Т. 15");
    expect(text).toContain("№ 3");
    expect(text).toContain("С. 45-60");
  });

  it("formats webpage with access date", () => {
    const text = formatGostEntry(web);
    expect(text).toContain("[Электронный ресурс]");
    expect(text).toContain("URL: https://protect.gost.ru/document/");
    expect(text).toContain("дата обращения: 21.04.2026");
  });
});

describe("formatGostBibliography", () => {
  it("sorts by first author surname (Russian collation) and numbers entries", () => {
    const list = formatGostBibliography([web, article, book]);
    expect(list[0]).toMatch(/^1\. /);
    expect(list[1]).toMatch(/^2\. /);
    expect(list[2]).toMatch(/^3\. /);
    // Sort key: author family OR title. "ГОСТ..." (title) < "Ковалев" < "Смирнов".
    expect(list[0]).toContain("ГОСТ 7.1");
    expect(list[1]).toContain("Ковалев");
    expect(list[2]).toContain("Смирнов");
  });
});
