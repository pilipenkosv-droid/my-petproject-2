/**
 * Тесты для утилит форматирования сообщений
 */

import {
  formatAlignment,
  formatFontFamily,
  formatFontSize,
  formatLineSpacing,
  formatIndent,
  formatMargin,
  formatQuoteType,
  formatDashType,
  formatSpaceType,
  formatViolationMessage,
} from "../formatting-messages";

describe("formatAlignment", () => {
  it("должен форматировать выравнивание по левому краю", () => {
    expect(formatAlignment("left")).toBe("по левому краю");
  });

  it("должен форматировать выравнивание по центру", () => {
    expect(formatAlignment("center")).toBe("по центру");
  });

  it("должен форматировать выравнивание по ширине", () => {
    expect(formatAlignment("justify")).toBe("по ширине");
    expect(formatAlignment("both")).toBe("по ширине");
  });

  it("должен форматировать выравнивание по правому краю", () => {
    expect(formatAlignment("right")).toBe("по правому краю");
  });

  it("должен возвращать оригинальное значение для неизвестного выравнивания", () => {
    expect(formatAlignment("unknown")).toBe("unknown");
  });
});

describe("formatFontSize", () => {
  it("должен конвертировать pt в пт", () => {
    expect(formatFontSize("14 pt")).toBe("14 пт");
    expect(formatFontSize("12pt")).toBe("12 пт");
    expect(formatFontSize("16 PT")).toBe("16 пт");
  });

  it("должен добавлять пт если его нет", () => {
    expect(formatFontSize("14")).toBe("14 пт");
  });
});

describe("formatLineSpacing", () => {
  it("должен форматировать стандартные интервалы", () => {
    expect(formatLineSpacing(1.0)).toBe("одинарный");
    expect(formatLineSpacing(1.5)).toBe("полуторный");
    expect(formatLineSpacing(2.0)).toBe("двойной");
  });

  it("должен возвращать числовое значение для нестандартных интервалов", () => {
    expect(formatLineSpacing(1.2)).toBe("1.2");
    expect(formatLineSpacing("1.8")).toBe("1.8");
  });
});

describe("formatIndent", () => {
  it("должен форматировать отступ в мм", () => {
    expect(formatIndent("12 мм")).toBe("12 мм");
    expect(formatIndent("15")).toBe("15 мм");
  });
});

describe("formatQuoteType", () => {
  it("должен форматировать угловые кавычки", () => {
    expect(formatQuoteType("угловые кавычки «»")).toBe("угловые кавычки «»");
    expect(formatQuoteType("«текст»")).toBe("угловые кавычки «»");
    expect(formatQuoteType("angular")).toBe("угловые кавычки «»");
  });

  it("должен форматировать прямые кавычки", () => {
    expect(formatQuoteType('прямые кавычки ""')).toBe('прямые кавычки ""');
    expect(formatQuoteType('"текст"')).toBe('прямые кавычки ""');
    expect(formatQuoteType("straight")).toBe('прямые кавычки ""');
  });
});

describe("formatDashType", () => {
  it("должен форматировать длинное тире", () => {
    expect(formatDashType("длинное тире (—)")).toBe("длинное тире (—)");
    expect(formatDashType("—")).toBe("длинное тире (—)");
    expect(formatDashType("em-dash")).toBe("длинное тире (—)");
  });

  it("должен форматировать среднее тире", () => {
    expect(formatDashType("среднее тире (–)")).toBe("среднее тире (–)");
    expect(formatDashType("–")).toBe("среднее тире (–)");
    expect(formatDashType("en-dash")).toBe("среднее тире (–)");
  });

  it("должен форматировать дефис", () => {
    expect(formatDashType("дефис (-)")).toBe("дефис (-)");
    expect(formatDashType("-")).toBe("дефис (-)");
    expect(formatDashType("hyphen")).toBe("дефис (-)");
  });
});

describe("formatSpaceType", () => {
  it("должен форматировать неразрывный пробел", () => {
    expect(formatSpaceType("неразрывный пробел")).toBe("неразрывный пробел");
  });

  it("должен форматировать обычный пробел", () => {
    expect(formatSpaceType("обычный пробел")).toBe("обычный пробел");
  });
});

describe("formatViolationMessage", () => {
  it("должен форматировать сообщение о выравнивании", () => {
    const result = formatViolationMessage(
      "Неверное выравнивание текста",
      "justify",
      "center",
      "text-align-5"
    );
    expect(result).toBe(
      'Неверное выравнивание текста: ожидается "по ширине", найдено "по центру"'
    );
  });

  it("должен форматировать сообщение о размере шрифта", () => {
    const result = formatViolationMessage(
      "Неверный размер шрифта",
      "14 pt",
      "12 pt",
      "text-size-5"
    );
    expect(result).toBe(
      'Неверный размер шрифта: ожидается "14 пт", найдено "12 пт"'
    );
  });

  it("должен форматировать сообщение о шрифте", () => {
    const result = formatViolationMessage(
      "Неверный шрифт",
      "Times New Roman",
      "Arial",
      "text-font-5"
    );
    expect(result).toBe(
      'Неверный шрифт: ожидается "Times New Roman", найдено "Arial"'
    );
  });

  it("должен форматировать сообщение о межстрочном интервале", () => {
    const result = formatViolationMessage(
      "Неверный межстрочный интервал",
      "1.5",
      "1.0",
      "text-spacing-5"
    );
    expect(result).toBe(
      'Неверный межстрочный интервал: ожидается "полуторный", найдено "одинарный"'
    );
  });

  it("должен форматировать сообщение об отступе", () => {
    const result = formatViolationMessage(
      "Неверный абзацный отступ",
      "12 мм",
      "0 мм",
      "text-indent-5"
    );
    expect(result).toBe(
      'Неверный абзацный отступ: ожидается "12 мм", найдено "0 мм"'
    );
  });

  it("должен форматировать сообщение о полях страницы", () => {
    const result = formatViolationMessage(
      "Неверное левое поле",
      "30 мм",
      "25 мм",
      "margins-left"
    );
    expect(result).toBe(
      'Неверное левое поле: ожидается "30 мм", найдено "25 мм"'
    );
  });

  it("должен форматировать сообщение о кавычках", () => {
    const result = formatViolationMessage(
      "Использованы прямые кавычки вместо угловых",
      "угловые кавычки «»",
      'прямые кавычки ""',
      "quotes-5-10"
    );
    expect(result).toBe(
      'Использованы прямые кавычки вместо угловых: ожидается "угловые кавычки «»", найдено "прямые кавычки ""'
    );
  });

  it("должен форматировать сообщение о тире", () => {
    const result = formatViolationMessage(
      "Использовано запрещенное длинное тире",
      "среднее тире (–) или дефис (-)",
      "длинное тире (—)",
      "em-dash-5-10"
    );
    expect(result).toBe(
      'Использовано запрещенное длинное тире: ожидается "среднее тире (–) или дефис (-)", найдено "длинное тире (—)"'
    );
  });

  it("должен форматировать сообщение о неразрывных пробелах", () => {
    const result = formatViolationMessage(
      "Требуется неразрывный пробел перед единицей измерения",
      "неразрывный пробел",
      "обычный пробел",
      "nbsp-unit-5-10"
    );
    expect(result).toBe(
      'Требуется неразрывный пробел перед единицей измерения: ожидается "неразрывный пробел", найдено "обычный пробел"'
    );
  });
});
