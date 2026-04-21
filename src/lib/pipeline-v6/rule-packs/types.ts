// RulePack — сериализуемый набор правил форматирования для методички/ГОСТа.
// Дизайн: ADR-013. Фаза 1 — ввести тип и seed GOST_7_32, прочая инфраструктура
// (БД-таблица formatting_templates, custom rule DSL, self-service upload) — phases 2-3.

import type { CheckSeverity } from "../checker";

/** Bibliography стандарт. Пока используется только как метаданные —
 *  bibliography integration в orchestrator — future work. */
export type BibliographyStyle = "gost-7.1" | "apa-7" | "chicago-17" | "none";

/** Нумерация заголовков. */
export type HeadingNumbering = "gost" | "decimal" | "alpha" | "none";

/** Конкретные значения правил — параметризуют 30 existing checker-проверок. */
export interface RulePackValues {
  margins: { top: number; bottom: number; left: number; right: number }; // mm
  fontFamily: string;
  fontSize: number;      // pt
  lineSpacing: number;   // 1.0 / 1.15 / 1.5 / 2.0
  paragraphIndent: number; // mm

  /** TOC title (передаётся в pandoc `--metadata toc-title=...`). */
  tocTitle: string;

  bibliographyStyle: BibliographyStyle;
  headingNumbering: HeadingNumbering;
}

/** DSL для методичко-специфичных кастомных правил. Фаза 2-3. */
export type RuleDetector =
  | { kind: "paragraph-text-regex"; pattern: string; flags?: string; expect: "match" | "no-match" }
  | { kind: "paragraph-style-equals"; style: string }
  | { kind: "numbered-caption-position"; objectType: "table" | "figure"; position: "above" | "below" }
  // Escape hatch: legacy-ts ссылается на функцию, зарегистрированную в коде.
  // Требует деплой для новых правил, но позволяет не блокировать.
  | { kind: "legacy-ts"; fnId: string };

export interface CustomRule {
  id: string;
  category: string;
  severity: CheckSeverity;
  name: string;
  detector: RuleDetector;
}

export interface RulePack {
  id: string;
  slug: string;
  name: string;

  /** Путь к reference-docx для pandoc (относительно process.cwd()). */
  referenceDocPath?: string;

  values: RulePackValues;

  /** Какие из 30 existing-правил активны. Пустой массив = все активны (по умолчанию). */
  enabled?: string[];

  /** Дополнительные правила поверх existing-30. Фаза 2+. */
  custom?: CustomRule[];
}
