/**
 * Rendering of a V7Report. Paragraph text is never printed — only paths,
 * roles, counts and rule codes.
 */

import type { V7Report } from "./orchestrator";
import type { Role } from "./classify/types";

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function topRoles(histogram: Record<Role, number>, limit = 6): string {
  return Object.entries(histogram)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([role, n]) => `${role}=${n}`)
    .join(" ");
}

function sources(map: Record<string, number>): string {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s}=${n}`)
    .join(" ");
}

/** Short, stable summary of one gate violation — used in reports and benches. */
export function violationSummaries(report: V7Report, limit = 3): string[] {
  return report.gate.violations.slice(0, limit).map((v) => `${v.kind}: ${v.message}`);
}

export function formatReportText(report: V7Report): string {
  const t = report.timings;
  const c = report.classification;
  const lines: string[] = [];
  lines.push(`документ: ${report.documentId}   пакет правил: ${report.pack}`);
  lines.push(`классификация: ${topRoles(c.histogram)}`);
  lines.push(`  источники: ${sources(c.sources)}`);
  lines.push(`  подозрительный: ${c.suspect ? "да" : "нет"}   низкая уверенность: ${c.lowConfidence.length}`);
  for (const w of c.warnings.slice(0, 5)) lines.push(`  ! ${w}`);
  lines.push(
    `перестилизация: абзацев ${report.restyle.paragraphsTouched}, ранов ${report.restyle.runsTouched}, ` +
      `секций ${report.restyle.sectionsTouched}, стилей ${report.restyle.stylesUpserted}` +
      (report.restyle.stylesPartMissing ? " (нет styles.xml)" : "")
  );
  if (report.refused) {
    lines.push(`ОТКАЗ: ${report.refused} — документ возвращён без изменений`);
  }
  const a = report.aux;
  lines.push(
    `дополнения: оглавление ${a.tocInserted ? "вставлено" : a.tocExisting ? "уже было" : "нет"}` +
      `${a.updateFields ? " (+updateFields)" : ""}, разрыв секции ${a.titleBreak ? "да" : "нет"}, ` +
      `шапок таблиц ${a.tblHeaderSet}, снято подчёркиваний ${a.underlineRemoved}, ` +
      `схлопнуто пробелов ${a.spacesCollapsed}, двойных точек ${a.doubleDotsFixed}, ` +
      `ужато рисунков ${a.imagesScaled}` +
      (a.tocSkipped ? `, пропущено: ${a.tocSkipped}` : "") +
      (a.redundantBreakRemoved ? ", снят лишний разрыв страницы" : "")
  );
  lines.push(
    `гейт: ${report.gate.pass ? "ПРОЙДЕН" : "ПРОВАЛЕН"}   ` +
      `нарушений ${report.gate.violations.length}, допущено ${report.gate.allowed.length}`
  );
  for (const v of violationSummaries(report, 10)) lines.push(`  ✗ ${v}`);
  lines.push(
    `чекер: было ${report.checker.sourceScore} → стало ${report.checker.finalScoreUndef} ` +
      `(без ролей, как в проде) / ${report.checker.finalScoreRoles} (с ролями v7)` +
      (report.checker.failed.length ? `   провалено: ${report.checker.failed.join(", ")}` : "")
  );
  lines.push(
    `время, мс: ${pad(`fp=${t.fingerprintBeforeMs}+${t.fingerprintAfterMs}`, 14)}` +
      `${pad(`classify=${t.classifyMs}`, 16)}${pad(`restyle=${t.restyleMs}`, 15)}` +
      `${pad(`aux=${t.auxMs}`, 11)}${pad(`save=${t.saveMs}`, 12)}${pad(`gate=${t.gateMs}`, 12)}` +
      `${pad(`checker=${t.checkerMs}`, 15)}${pad(`формат=${t.formatMs}`, 14)}всего=${t.totalMs}`
  );
  return lines.join("\n");
}

/**
 * JSON form of the report. Block text inside the gate diff is redacted to a
 * length marker — a report is a diagnostic, never a copy of the document.
 */
export function toJson(report: V7Report): string {
  return JSON.stringify(
    report,
    (key, value) => (key === "text" && typeof value === "string" ? `len:${value.length}` : value),
    2
  );
}
