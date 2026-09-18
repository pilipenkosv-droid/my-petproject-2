/**
 * Классификатор ошибок воркера: от него зависит, вернётся ли задача в очередь
 * или сгорит вместе со списанием пользователя.
 */

import { describe, it, expect } from "vitest";
import {
  EXIT_OK,
  EXIT_PERMANENT,
  EXIT_TRANSIENT,
  isTransientError,
} from "../../../ops/worker/errors";

describe("коды выхода", () => {
  it("различимы между собой", () => {
    expect(new Set([EXIT_OK, EXIT_PERMANENT, EXIT_TRANSIENT]).size).toBe(3);
  });
});

describe("isTransientError", () => {
  it("сетевые сбои — временные", () => {
    expect(isTransientError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("read ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("getaddrinfo EAI_AGAIN gateway.ai"))).toBe(true);
  });

  it("таймаут внешнего бинарника — временный", () => {
    expect(isTransientError(new Error("spawnSync pandoc ETIMEDOUT"))).toBe(true);
    expect(isTransientError(new Error("Command failed: soffice ... killed"))).toBe(true);
  });

  it("5xx шлюза — временная, 4xx — терминальная", () => {
    expect(isTransientError(Object.assign(new Error("gateway"), { status: 503 }))).toBe(true);
    expect(isTransientError(Object.assign(new Error("gateway"), { status: 400 }))).toBe(false);
  });

  it("ошибки самого документа — терминальные", () => {
    expect(isTransientError(new Error("Исходный документ недоступен в хранилище"))).toBe(false);
    expect(isTransientError(new Error("Не удалось обработать документ"))).toBe(false);
    expect(isTransientError(new Error("fidelity gate refused"))).toBe(false);
  });

  it("не-Error значения не роняют классификатор", () => {
    expect(isTransientError("fetch failed")).toBe(true);
    expect(isTransientError(undefined)).toBe(false);
  });

  it("причина внутри cause тоже учитывается", () => {
    const wrapped = new Error("upload failed", { cause: new Error("socket hang up") });
    expect(isTransientError(wrapped)).toBe(true);
  });
});
