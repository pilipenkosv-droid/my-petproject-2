import { describe, it, expect } from "vitest";
import { truncateText, truncateOutline } from "@/lib/ai/truncate-output";

describe("truncateText", () => {
  it("returns empty for empty input", () => {
    const r = truncateText("");
    expect(r.truncated).toBe("");
    expect(r.hiddenChars).toBe(0);
  });

  it("returns text as-is when shorter than 20 chars", () => {
    const r = truncateText("short");
    expect(r.truncated).toBe("short");
    expect(r.hiddenChars).toBe(0);
  });

  it("cuts at word boundary near 50%", () => {
    const text = "one two three four five six seven eight nine ten eleven twelve";
    const r = truncateText(text, 50);
    expect(r.truncated.endsWith("…")).toBe(true);
    expect(r.hiddenChars).toBeGreaterThan(0);
    // Не должно быть разорванного слова перед …
    const withoutEllipsis = r.truncated.slice(0, -1).trimEnd();
    expect(text.startsWith(withoutEllipsis)).toBe(true);
  });

  it("respects custom percent", () => {
    const text = "a".repeat(100) + " " + "b".repeat(100);
    const r25 = truncateText(text, 25);
    const r75 = truncateText(text, 75);
    expect(r25.hiddenChars).toBeGreaterThan(r75.hiddenChars);
  });

  it("handles text with no whitespace below targetIdx by falling back to targetIdx", () => {
    const text = "x".repeat(50) + " word";
    const r = truncateText(text, 50);
    expect(r.truncated.endsWith("…")).toBe(true);
  });
});

describe("truncateOutline", () => {
  it("returns empty for empty input", () => {
    const r = truncateOutline("");
    expect(r.truncated).toBe("");
    expect(r.hiddenSections).toBe(0);
  });

  it("falls back to text truncation when no headings", () => {
    const md = "просто длинный текст без заголовков ".repeat(10);
    const r = truncateOutline(md, 50);
    expect(r.truncated.length).toBeLessThan(md.length);
  });

  it("returns full content for single section", () => {
    const md = "# Введение\n\nТекст введения";
    const r = truncateOutline(md);
    expect(r.truncated).toBe(md);
    expect(r.hiddenSections).toBe(0);
  });

  it("hides ~50% of sections for multi-section outline", () => {
    const md = [
      "# 1. Введение",
      "Текст 1",
      "# 2. Глава 1",
      "Текст 2",
      "# 3. Глава 2",
      "Текст 3",
      "# 4. Глава 3",
      "Текст 4",
      "# 5. Заключение",
      "Текст 5",
    ].join("\n");
    const r = truncateOutline(md, 50);
    expect(r.hiddenSections).toBeGreaterThan(0);
    expect(r.hiddenSections).toBeLessThan(5);
    expect(r.truncated).toContain("# 1. Введение");
    expect(r.truncated).not.toContain("# 5. Заключение");
    expect(r.truncated.endsWith("…")).toBe(true);
  });

  it("handles h2 level too", () => {
    const md = "## Section A\nbody\n## Section B\nbody\n## Section C\nbody\n## Section D\nbody";
    const r = truncateOutline(md, 50);
    expect(r.hiddenSections).toBeGreaterThan(0);
  });
});
