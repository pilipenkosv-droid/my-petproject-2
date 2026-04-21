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
    description: "Заменить ≥2 подряд идущих пробелов на один (включая пробелы, разбитые через runs/tab/hyperlink)",
    apply: (xml: string) => {
      // Pass 1: collapse spaces within a single <w:t>.
      let out = xml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (_m, attrs, text) => {
        return `<w:t${attrs}>${(text as string).replace(/ {2,}/g, " ")}</w:t>`;
      });
      // Pass 2 (paragraph-scoped): for each <w:p>, inspect its w:t contents in
      // order. If the concatenation has runs of 2+ spaces, walk through the
      // w:t nodes and trim leading space on a w:t whose predecessor ended with
      // a space. This handles every cross-run case — tab, hyperlink, bookmark,
      // symbol, etc. — without having to enumerate OOXML sibling patterns.
      out = out.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (pXml) => {
        const tRegex = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
        const matches: { fullMatch: string; attrs: string; text: string; start: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = tRegex.exec(pXml))) {
          matches.push({ fullMatch: m[0], attrs: m[1], text: m[2], start: m.index });
        }
        if (matches.length < 2) return pXml;
        let prevEndsWithSpace = false;
        let anyChange = false;
        const patched = matches.map((mt) => {
          let t = mt.text;
          if (prevEndsWithSpace && t.startsWith(" ")) {
            t = t.replace(/^ +/, "");
            anyChange = true;
          }
          prevEndsWithSpace = t.length > 0 && t.endsWith(" ");
          return { ...mt, text: t };
        });
        if (!anyChange) return pXml;
        // Splice back in reverse order to preserve offsets.
        let res = pXml;
        for (let i = patched.length - 1; i >= 0; i--) {
          const mt = patched[i];
          const replacement = `<w:t${mt.attrs}>${mt.text}</w:t>`;
          res = res.slice(0, mt.start) + replacement + res.slice(mt.start + mt.fullMatch.length);
        }
        return res;
      });
      return out;
    },
  },
  "text.doubleDots": {
    description: "Заменить двойные точки (..) на одинарные, не трогая многоточия (...)",
    apply: (xml: string) => {
      // Pass 1: within a single <w:t>.
      let out = xml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (_m, attrs, text) => {
        const fixed = (text as string).replace(/(?<!\.)\.\.(?!\.)/g, ".");
        return `<w:t${attrs}>${fixed}</w:t>`;
      });
      // Pass 2 (paragraph-scoped, cross-run): if a <w:t> ends with "." and
      // the next <w:t> (in document order) starts with "." — and neither is
      // part of a "..." ellipsis — collapse by stripping the leading "."
      // from the successor. Skips cases where stripping would create a new
      // "..." artefact.
      out = out.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (pXml) => {
        const tRegex = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
        const matches: { fullMatch: string; attrs: string; text: string; start: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = tRegex.exec(pXml))) {
          matches.push({ fullMatch: m[0], attrs: m[1], text: m[2], start: m.index });
        }
        if (matches.length < 2) return pXml;
        let anyChange = false;
        const patched = matches.map((mt, i) => {
          if (i === 0) return mt;
          const prev = matches[i - 1].text;
          const prevEndsSingleDot = /(?<!\.)\.$/.test(prev); // single "." at end
          const curStartsSingleDot = /^\.(?!\.)/.test(mt.text); // "." not followed by "."
          if (prevEndsSingleDot && curStartsSingleDot) {
            anyChange = true;
            return { ...mt, text: mt.text.replace(/^\./, "") };
          }
          return mt;
        });
        if (!anyChange) return pXml;
        let res = pXml;
        for (let i = patched.length - 1; i >= 0; i--) {
          const mt = patched[i];
          const replacement = `<w:t${mt.attrs}>${mt.text}</w:t>`;
          res = res.slice(0, mt.start) + replacement + res.slice(mt.start + mt.fullMatch.length);
        }
        return res;
      });
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
