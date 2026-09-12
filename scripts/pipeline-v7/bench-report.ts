/**
 * Row shapes and report rendering for the v7 bench.
 *
 * PRIVACY: ids, counts, timings and rule codes only — never document text.
 */

export interface Side {
  gate: boolean | null;
  violations: string[];
  /**
   * The checker score with no paragraph roles supplied — what production sees.
   * This is the only column comparable across pipelines, and criterion (2)
   * uses it on both sides.
   */
  score: number | null;
  /** v7 only: the same checker told v7's roles. Not comparable to v6. */
  scoreRoles?: number | null;
  ms: number;
  /** Total minus fingerprint-after, gate and checker — the formatting itself. */
  formatMs?: number;
  /** Checker rule ids still failing (v7 only). */
  failed?: string[];
  /** v7 refused to touch the document (suspect classification). */
  refused?: boolean;
  error?: string;
}

export interface Row {
  id: string;
  set: "synthetic" | "real";
  v7: Side;
  v6?: Side;
  legacy?: Side;
  pages: { src: number | null; v7: number | null; v6: number | null };
  sofficeRefusedV7?: boolean;
}

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export const percentile = (xs: number[], q: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
};

export const mark = (v: boolean | null): string => (v === null ? "—" : v ? "да" : "НЕТ");
export const num = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : String(v));

export function markdownTable(rows: Row[]): string {
  const head =
    "| doc | набор | v7 гейт | v7 отказ | v7 diff (топ) | v7 score (без ролей) | v7 score (с ролями) | " +
    "v7 мс (формат) | v7 мс (всего) | v6 гейт | v6 diff (топ) | v6 score (без ролей) | leg гейт | leg score | стр. src/v7/v6 |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const body = rows.map((r) => {
    const cell = (s?: Side) => (s ? [mark(s.gate), s.violations[0]?.slice(0, 60) ?? (s.error ? `ошибка: ${s.error.slice(0, 40)}` : "—"), num(s.score)] : ["—", "—", "—"]);
    const [v6g, v6d, v6s] = cell(r.v6);
    const [lg, , ls] = cell(r.legacy);
    const v7d = r.v7.violations[0]?.slice(0, 60) ?? (r.v7.error ? `ошибка: ${r.v7.error.slice(0, 40)}` : "—");
    return (
      `| ${r.id.slice(0, 22)} | ${r.set} | ${mark(r.v7.gate)} | ${r.v7.refused ? "да" : "нет"} | ${v7d} | ` +
      `${num(r.v7.score)} | ${num(r.v7.scoreRoles)} | ${num(r.v7.formatMs)} | ${r.v7.ms} | ` +
      `${v6g} | ${v6d} | ${v6s} | ${lg} | ${ls} | ${num(r.pages.src)}/${num(r.pages.v7)}/${num(r.pages.v6)} |`
    );
  });
  return [head, sep, ...body].join("\n");
}

export function criteria(rows: Row[]): string[] {
  const syn = rows.filter((r) => r.set === "synthetic");
  const real = rows.filter((r) => r.set === "real");
  const passed = (rs: Row[], pick: (r: Row) => Side | undefined) =>
    rs.filter((r) => pick(r)?.gate === true).length;
  const v7syn = passed(syn, (r) => r.v7);
  const v7real = passed(real, (r) => r.v7);
  const realWithV6 = real.filter((r) => r.v6);
  const v6realFail = realWithV6.filter((r) => r.v6!.gate === false).length;
  const v7scores = rows.map((r) => r.v7.score).filter((x): x is number => x !== null);
  const v6scores = rows.map((r) => r.v6?.score).filter((x): x is number => x != null);
  const mv7 = median(v7scores);
  const mv6 = median(v6scores);
  const regressions = rows.filter(
    (r) => r.v7.score !== null && r.v7.score < 70 && (r.v6?.score ?? 0) > 70
  );
  const p95 = percentile(rows.map((r) => r.v7.ms), 0.95);
  const p95fmt = percentile(
    rows.map((r) => r.v7.formatMs).filter((x): x is number => x !== undefined),
    0.95
  );
  const refusedRows = rows.filter((r) => r.v7.refused);
  const mv7roles = median(rows.map((r) => r.v7.scoreRoles).filter((x): x is number => x != null));
  const synOk = syn.length > 0 && v7syn === syn.length;
  const realOk = real.length > 0 && v7real / real.length >= 0.9;
  const c2 = mv7 !== null && mv6 !== null && mv7 >= mv6 && regressions.length === 0;
  const failShare = realWithV6.length ? v6realFail / realWithV6.length : 0;
  const out = [
    `(1) гейт v7: synthetic ${v7syn}/${syn.length}, real ${v7real}/${real.length} (порог 90 %) → ${synOk && realOk ? "ДА" : "НЕТ"}`,
    `(2) медиана score без ролей: v7 ${num(mv7)} vs v6 ${num(mv6)}, регрессий (v7<70 при v6>70) ` +
      `${regressions.length}${regressions.length ? ` [${regressions.map((r) => r.id.slice(0, 8)).join(", ")}]` : ""} → ${c2 ? "ДА" : "НЕТ"}`,
    `    справочно: медиана score v7 с ролями ${num(mv7roles)} — с v6 не сравнима, чекеру там роли не передают`,
    `(3) p95 времени v7 ${num(p95)} мс всего / ${num(p95fmt)} мс без замеров < 8000 → ${p95 !== null && p95 < 8000 ? "ДА" : "НЕТ"}`,
    `(4) v6 нарушает контракт неизменности содержимого на ${realWithV6.length ? Math.round(failShare * 100) : 0} % реальных документов` +
      ` (порог наблюдения 60 %) → ${failShare >= 0.6 ? "ДА" : "НЕТ"}`,
    `отказов v7 (suspect-классификация, документ вернулся без изменений): ${refusedRows.length}` +
      `${refusedRows.length ? ` [${refusedRows.map((r) => r.id.slice(0, 12)).join(", ")}]` : ""}`,
  ];
  const refused = rows.filter((r) => r.sofficeRefusedV7).map((r) => r.id.slice(0, 12));
  out.push(`LibreOffice отказался конвертировать v7: ${refused.length ? refused.join(", ") : "нет"}`);
  return out;
}

export function summary(rows: Row[]): string[] {
  const lines: string[] = [];
  for (const set of ["synthetic", "real"] as const) {
    const rs = rows.filter((r) => r.set === set);
    if (!rs.length) continue;
    lines.push(
      `${set}: v7 гейт ${rs.filter((r) => r.v7.gate === true).length}/${rs.length}, ` +
        `v6 гейт ${rs.filter((r) => r.v6?.gate === true).length}/${rs.filter((r) => r.v6).length}, ` +
        `отказов v7 ${rs.filter((r) => r.v7.refused).length}, ` +
        `медиана score v7 ${num(median(rs.map((r) => r.v7.score).filter((x): x is number => x !== null)))} ` +
        `(с ролями ${num(median(rs.map((r) => r.v7.scoreRoles).filter((x): x is number => x != null)))}), ` +
        `v6 ${num(median(rs.map((r) => r.v6?.score).filter((x): x is number => x != null)))}, ` +
        `p95 v7 ${num(percentile(rs.map((r) => r.v7.ms), 0.95))} мс всего / ` +
        `${num(percentile(rs.map((r) => r.v7.formatMs).filter((x): x is number => x !== undefined), 0.95))} мс формат`
    );
  }
  return lines;
}

export function topFailed(rows: Row[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const id of r.v7.failed ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, n]) => `${id} ×${n}`);
}

export function topViolations(rows: Row[], pick: (r: Row) => Side | undefined): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const v of pick(r)?.violations ?? []) {
      const kind = v.split(":")[0];
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`);
}
