/**
 * Юнит-тесты src/lib/processing/stage.ts — воркер выбирает этап по строке
 * задачи, другого признака этапа в БД нет.
 */

import { describe, it, expect } from "vitest";
import { resolveJobStage } from "@/lib/processing/stage";

describe("resolveJobStage", () => {
  it("режим gost → обработка по стандартному ГОСТу", () => {
    expect(resolveJobStage({ requirementsMode: "gost" })).toBe("gost");
  });

  it("методичка загружена, текста ещё нет → разбор методички", () => {
    expect(resolveJobStage({ requirementsMode: "upload" })).toBe("extract-rules");
  });

  it("методичка разобрана → форматирование по подтверждённым правилам", () => {
    expect(
      resolveJobStage({ requirementsMode: "upload", guidelinesText: "Требования..." })
    ).toBe("confirm-rules");
  });

  it("пустые поля: режим не задан → gost", () => {
    expect(resolveJobStage({})).toBe("gost");
  });

  it("пробельный текст методички считается отсутствующим", () => {
    expect(
      resolveJobStage({ requirementsMode: "upload", guidelinesText: "   \n" })
    ).toBe("extract-rules");
  });
});
