/**
 * Строка отчёта визуального бенча и её рендер в markdown.
 *
 * PRIVACY: в таблицу идут только id, числа и коды флагов.
 */

import type { HeadingOrderResult, TocCheckResult } from "./metrics";

export interface VisualRow {
  id: string;
  set: "synthetic" | "real";
  ms: number;
  error?: string;
  gate: boolean | null;
  refused: boolean;
  pagesBefore: number | null;
  pagesAfter: number | null;
  pagesRatio: number | null;
  headings: HeadingOrderResult;
  toc: TocCheckResult & { filled?: number; tocSkipped?: string };
  intro: "ok" | "bad" | "n/a";
  title: "ok" | "lost" | "n/a";
  /** Пиксельный diff против golden: null — не делался. */
  diff: boolean | null;
  flags: string[];
}

export const FLAG_LABELS: Record<string, string> = {
  "pages-ratio": "страниц стало в 1.5+ раза больше или в 2 раза меньше",
  "heading-order": "заголовок не нашёлся в отрендеренном PDF по порядку",
  "toc-pages": "номера страниц в содержании расходятся с фактическими",
  "toc-missing": "содержание не вставлено или не распознано в рендере",
  "no-headings": "классификатор не нашёл в документе ни одного заголовка",
  "intro-order": "«Введение» стоит после первой нумерованной главы",
  "title-lost": "титульная страница была в исходнике и пропала в выходе",
  "soffice-refused": "LibreOffice не смог открыть выход",
  "gate-fail": "гейт верности не пройден",
  refused: "классификация suspect — документ вернулся нетронутым",
  "pixel-diff": "пиксельный diff против golden не совпал",
  error: "прогон упал",
};

const n = (v: number | null): string => (v === null ? "—" : String(v));

export function computeFlags(r: VisualRow): string[] {
  const f: string[] = [];
  if (r.error) f.push("error");
  if (r.refused) f.push("refused");
  if (r.gate === false) f.push("gate-fail");
  if (r.pagesAfter === null && !r.error) f.push("soffice-refused");
  if (r.pagesRatio !== null && (r.pagesRatio > 1.5 || r.pagesRatio < 0.5)) f.push("pages-ratio");
  if (r.headings.firstMissing !== null) f.push("heading-order");
  if (r.headings.total === 0 && !r.refused && !r.error && r.pagesAfter !== null) f.push("no-headings");
  if (r.toc.status === "mismatch") f.push("toc-pages");
  if (r.toc.status === "no-entries" && !r.refused) f.push("toc-missing");
  if (r.intro === "bad") f.push("intro-order");
  if (r.title === "lost") f.push("title-lost");
  if (r.diff === false) f.push("pixel-diff");
  return f;
}

export function table(rows: VisualRow[]): string {
  const head =
    "| id | набор | стр. до | стр. после | ×  | заголовки найдено/всего | TOC расх./строк | Введение | титул | флаги |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|";
  const body = rows.map((r) =>
    [
      r.id.slice(0, 22),
      r.set,
      n(r.pagesBefore),
      n(r.pagesAfter),
      r.pagesRatio === null ? "—" : r.pagesRatio.toFixed(2),
      `${r.headings.resolved}/${r.headings.total}`,
      r.toc.status === "no-entries" ? "нет TOC" : `${r.toc.mismatches}/${r.toc.entries}`,
      r.intro,
      r.title,
      r.flags.join(" ") || "—",
    ].join(" | ")
  );
  return [head, sep, ...body.map((l) => `| ${l} |`)].join("\n");
}

function count(rows: VisualRow[], flag: string): number {
  return rows.filter((r) => r.flags.includes(flag)).length;
}

export function summary(rows: VisualRow[]): string[] {
  const clean = rows.filter((r) => r.flags.length === 0).length;
  const lines = [
    `документов: ${rows.length}, без единого флага: ${clean} (${Math.round((clean / Math.max(rows.length, 1)) * 100)}%)`,
    `медиана времени прогона v7: ${median(rows.map((r) => r.ms))} мс`,
  ];
  for (const flag of Object.keys(FLAG_LABELS)) {
    const c = count(rows, flag);
    if (c) lines.push(`\`${flag}\` — ${c}: ${FLAG_LABELS[flag]}`);
  }
  return lines;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Расхождения номеров в содержании по документам, со сдвигом.
 *
 * Один и тот же сдвиг у всех строк — это не «номера посчитаны неверно», а
 * «номера посчитали до того, как содержание само добавило страниц».
 */
export function tocDeltaSection(rows: VisualRow[]): string[] {
  const out = rows
    .filter((r) => r.toc.mismatches > 0)
    .map((r) => {
      const d = Object.entries(r.toc.deltas).sort((a, b) => b[1] - a[1]);
      const dominant = d[0];
      const share = Math.round((dominant[1] / r.toc.mismatches) * 100);
      return `\`${r.id}\` — ${r.toc.mismatches} расх., чаще всего сдвиг ${dominant[0]} (${share}% расхождений), значений сдвига: ${d.length}`;
    });
  return out.length ? out : ["нет"];
}

/** Документы с флагами — только id и коды. */
export function flagged(rows: VisualRow[]): string[] {
  return rows
    .filter((r) => r.flags.length)
    .map((r) => `\`${r.id}\` (${r.set}) — ${r.flags.join(", ")}`);
}
