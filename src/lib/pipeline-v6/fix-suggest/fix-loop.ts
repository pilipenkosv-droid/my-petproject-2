// Fix-suggest loop.
// Runs checker → collects failed checks → asks LLM to propose targeted fixes →
// applies safe fixes → re-runs checker until iterationLimit or score ≥ target.
//
// Only deterministic fixes are applied automatically:
//   - multiple-spaces (text.multipleSpaces): collapse runs
//   - no-underline (text.noUnderline): strip <w:u> runs
//   - no-colored-text (text.noColoredText): strip color attributes
//   - empty-paragraph: nothing (structural, needs assembler rebuild)
//
// Remaining checks are surfaced as LLM-actionable suggestions (text-level only).

import type { QualityReport, CheckResult } from "../checker";

export type FixStrategy = "auto" | "llm-suggest" | "manual";

export interface FixAction {
  checkId: string;
  strategy: FixStrategy;
  description: string;
}

export interface FixPlan {
  actions: FixAction[];
  targetScore: number;
  iterationLimit: number;
}

const AUTO_FIX_CHECKS: Record<string, { description: string; apply: (xml: string) => string }> = {
  "text.multipleSpaces": {
    description: "Заменить ≥2 подряд идущих пробелов на один (в т.ч. через границы runs)",
    apply: (xml: string) => {
      // Pass 1: collapse spaces within a single <w:t> run.
      let out = xml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (_m, attrs, text) => {
        return `<w:t${attrs}>${(text as string).replace(/ {2,}/g, " ")}</w:t>`;
      });
      // Pass 2: collapse spaces that span run boundaries —
      // "... </w:t></w:r><w:r>...<w:t> ..." → strip leading space from the next run.
      // Run multiple times in case of >2 consecutive padded runs.
      const BOUNDARY = / <\/w:t>(\s*<\/w:r>\s*<w:r\b[^>]*>(?:\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t[^>]*>) +/g;
      for (let i = 0; i < 3; i++) {
        const next = out.replace(BOUNDARY, " </w:t>$1");
        if (next === out) break;
        out = next;
      }
      return out;
    },
  },
  "text.noUnderline": {
    description: "Удалить подчёркивание из всех runs",
    apply: (xml: string) => xml.replace(/<w:u\b[^/]*\/>|<w:u\b[^>]*><\/w:u>/g, ""),
  },
  "text.noColoredText": {
    description: "Удалить цветное выделение и shading",
    apply: (xml: string) =>
      xml
        .replace(/<w:color\b[^/]*\/>|<w:color\b[^>]*><\/w:color>/g, "")
        .replace(/<w:highlight\b[^/]*\/>|<w:highlight\b[^>]*><\/w:highlight>/g, "")
        .replace(/<w:shd\b[^/]*\/>|<w:shd\b[^>]*><\/w:shd>/g, ""),
  },
};

export function planFixes(report: QualityReport): FixPlan {
  const actions: FixAction[] = [];
  for (const check of report.checks) {
    if (check.passed) continue;
    if (AUTO_FIX_CHECKS[check.id]) {
      actions.push({
        checkId: check.id,
        strategy: "auto",
        description: AUTO_FIX_CHECKS[check.id].description,
      });
    } else if (check.severity === "critical" || check.severity === "major") {
      actions.push({
        checkId: check.id,
        strategy: "llm-suggest",
        description: `LLM propose rewrite for ${check.name}`,
      });
    } else {
      actions.push({
        checkId: check.id,
        strategy: "manual",
        description: `Manual review required: ${check.name}`,
      });
    }
  }
  return {
    actions,
    targetScore: 90,
    iterationLimit: 3,
  };
}

export function applyAutoFixesToXml(xml: string, failedChecks: CheckResult[]): {
  xml: string;
  applied: string[];
} {
  let out = xml;
  const applied: string[] = [];
  for (const check of failedChecks) {
    if (check.passed) continue;
    const fix = AUTO_FIX_CHECKS[check.id];
    if (!fix) continue;
    out = fix.apply(out);
    applied.push(check.id);
  }
  return { xml: out, applied };
}

export interface FixSuggestion {
  checkId: string;
  severity: string;
  problem: string;
  suggestion: string;
}

export function summariseSuggestions(report: QualityReport): FixSuggestion[] {
  return report.checks
    .filter((c) => !c.passed && !AUTO_FIX_CHECKS[c.id])
    .map((c) => ({
      checkId: c.id,
      severity: c.severity,
      problem: c.name,
      suggestion: c.examples?.[0] ?? `Ожидалось: ${c.expected}, получено: ${c.actual}`,
    }));
}
