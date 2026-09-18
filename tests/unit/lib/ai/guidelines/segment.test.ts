import { describe, it, expect } from "vitest";
import { segmentGuidelines, MAX_UNIT_CHARS, MIN_UNIT_CHARS } from "@/lib/ai/guidelines/segment";

/** Абзац заданной длины из осмысленных предложений по ~90 символов. */
function paragraph(chars: number, seed: number): string {
  const out: string[] = [];
  let n = 0;
  while (out.join(" ").length < chars) {
    out.push(`Требование ${seed}.${n} гласит, что шрифт основного текста работы должен быть читаемым.`);
    n++;
  }
  return out.join(" ").slice(0, chars);
}

describe("segmentGuidelines", () => {
  it("режет по абзацам и нумерует единицы подряд", () => {
    const units = segmentGuidelines(
      "Основной текст набирается шрифтом Times New Roman.\n\n" +
        "Межстрочный интервал полуторный во всём документе."
    );
    expect(units).toHaveLength(2);
    expect(units.map((u) => u.i)).toEqual([0, 1]);
    expect(units[0].text).toContain("Times New Roman");
  });

  it("выбрасывает единицы короче порога", () => {
    const units = segmentGuidelines("2.\n\nстр.\n\nПоля страницы: левое 30 мм, правое 15 мм.");
    expect(units).toHaveLength(1);
    expect(units[0].text.length).toBeGreaterThanOrEqual(MIN_UNIT_CHARS);
  });

  it("приклеивает нумерованный заголовок к следующей единице и помнит секцию", () => {
    const units = segmentGuidelines(
      "2.3 Оформление таблиц\n\nТаблицы нумеруются сквозной нумерацией арабскими цифрами."
    );
    expect(units).toHaveLength(1);
    expect(units[0].text.startsWith("2.3 Оформление таблиц")).toBe(true);
    expect(units[0].section).toBe("2.3 Оформление таблиц");
  });

  it("дробит длинный абзац по границам предложений", () => {
    const units = segmentGuidelines(paragraph(2600, 1));
    expect(units.length).toBeGreaterThan(1);
    for (const u of units) expect(u.text.length).toBeLessThanOrEqual(MAX_UNIT_CHARS);
  });

  it("35 абзацев по 2,6k символов дают единицы не длиннее порога", () => {
    const text = Array.from({ length: 35 }, (_, n) => paragraph(2600, n)).join("\n\n");
    const units = segmentGuidelines(text);

    expect(units.length).toBeGreaterThanOrEqual(35 * 4);
    const tooLong = units.filter((u) => u.text.length > MAX_UNIT_CHARS);
    expect(tooLong).toEqual([]);
    expect(units.map((u) => u.i)).toEqual(units.map((_, n) => n));
  });

  it("не режет предложение посередине, даже если оно длиннее порога", () => {
    const long = "Требование " + "и".repeat(MAX_UNIT_CHARS + 100) + ".";
    const units = segmentGuidelines(long);
    expect(units).toHaveLength(1);
    expect(units[0].text.length).toBeGreaterThan(MAX_UNIT_CHARS);
  });

  it("строки таблицы остаются отдельными единицами", () => {
    const units = segmentGuidelines(
      "Шрифт основного текста | Times New Roman 14\n" +
        "Межстрочный интервал текста | 1,5\n" +
        "Абзацный отступ в тексте | 1,25 см"
    );
    expect(units).toHaveLength(3);
  });

  it("детерминирован: два прогона дают идентичный результат", () => {
    const text = Array.from({ length: 5 }, (_, n) => paragraph(1400, n)).join("\n\n");
    expect(JSON.stringify(segmentGuidelines(text))).toBe(JSON.stringify(segmentGuidelines(text)));
  });
});
