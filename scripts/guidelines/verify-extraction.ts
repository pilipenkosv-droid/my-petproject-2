/**
 * Проверка починенного извлечения правил на реальных методичках.
 *
 * Считает, сколько документов дают правила, отличные от DEFAULT_GOST_RULES,
 * и во сколько это обходится. Платные вызовы — запускать только с явного
 * согласия владельца на бюджет.
 *
 * Корпус: data/bench/guidelines/docs/*.txt (готовит export-guidelines.ts).
 * Сначала берутся документы эталонного набора (gold/index.json), если он есть.
 *
 * Запуск: NODE_USE_ENV_PROXY=1 npx tsx scripts/guidelines/verify-extraction.ts --limit 15
 */

import * as fs from "fs";
import * as path from "path";
import { isDeepStrictEqual } from "util";
import { DOCS_DIR, GOLD_DIR, readJson } from "./common";
import { parseFormattingRules, mergeWithDefaults, RulesExtractionError } from "../../src/lib/ai/provider";
import { DEFAULT_GOST_RULES, type FormattingRules } from "../../src/types/formatting-rules";

/** Жёсткий потолок расходов этого скрипта. */
const HARD_CAP_USD = 1.0;
/** Прайс google/gemini-2.5-flash, $/млн токенов (fallback, если шлюз не вернул usage). */
const PRICE_IN = 0.3 / 1_000_000;
const PRICE_OUT = 2.5 / 1_000_000;

const SECTIONS: Array<keyof FormattingRules> = [
  "document", "text", "headings", "lists", "specialElements", "additional",
];

interface Row {
  id: string;
  chars: number;
  status: "ok" | "normalized" | "error";
  reason?: string;
  differs: boolean;
  changedSections: string[];
  confidence?: number;
  droppedChars?: number;
  retriedCompact?: boolean;
  costUsd: number;
}

function parseLimit(argv: string[]): number {
  const flag = argv.indexOf("--limit");
  if (flag >= 0 && argv[flag + 1]) return Number(argv[flag + 1]);
  const positional = argv.find((a) => /^\d+$/.test(a));
  return positional ? Number(positional) : 15;
}

/** Документы эталона — первыми, дальше остальные по возрастанию длины. */
function pickDocs(limit: number): string[] {
  const all = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4));
  const goldFile = path.join(GOLD_DIR, "index.json");
  const gold = fs.existsSync(goldFile) ? Object.keys(readJson<Record<string, unknown>>(goldFile)) : [];
  const ordered = [...gold.filter((id) => all.includes(id)), ...all.filter((id) => !gold.includes(id))];
  return ordered.slice(0, limit);
}

function changedSections(rules: FormattingRules): string[] {
  return SECTIONS.filter((s) => !isDeepStrictEqual(rules[s], DEFAULT_GOST_RULES[s])).map(String);
}

async function runDoc(id: string, text: string): Promise<Row> {
  const base: Row = { id, chars: text.length, status: "ok", differs: false, changedSections: [], costUsd: 0 };
  try {
    const res = await parseFormattingRules(text);
    const rules = mergeWithDefaults(res.rules);
    const costUsd =
      (res.usage?.inputTokens ?? 0) * PRICE_IN + (res.usage?.outputTokens ?? 0) * PRICE_OUT;
    return {
      ...base,
      status: res.normalized ? "normalized" : "ok",
      differs: !isDeepStrictEqual(rules, DEFAULT_GOST_RULES),
      changedSections: changedSections(rules),
      confidence: res.confidence,
      droppedChars: res.droppedChars,
      retriedCompact: res.retriedCompact,
      costUsd,
    };
  } catch (error) {
    const reason = error instanceof RulesExtractionError ? error.reason : "unknown";
    console.error(`  ! ${id}: ${reason} — ${error instanceof Error ? error.message.slice(0, 160) : error}`);
    // Стоимость неудачного вызова шлюз здесь не отдаёт — считаем по входу.
    return { ...base, status: "error", reason, costUsd: (text.length / 4) * PRICE_IN };
  }
}

function report(rows: Row[], spent: number): void {
  const ok = rows.filter((r) => r.status === "ok").length;
  const normalized = rows.filter((r) => r.status === "normalized").length;
  const errors = rows.filter((r) => r.status === "error");
  const differs = rows.filter((r) => r.differs).length;

  console.log("\n================ ИТОГ ================");
  console.log(`Документов: ${rows.length}`);
  console.log(`Разобрано сразу: ${ok} · после нормализации имён: ${normalized}`);
  console.log(`Ошибок: ${errors.length}`);
  const byReason = new Map<string, number>();
  for (const e of errors) byReason.set(e.reason!, (byReason.get(e.reason!) ?? 0) + 1);
  for (const [reason, n] of byReason) console.log(`  ${reason}: ${n}`);

  const done = rows.length - errors.length;
  const share = done ? ((differs / done) * 100).toFixed(1) : "0.0";
  console.log(`Правила отличаются от ГОСТ: ${differs} из ${done} разобранных (${share} %)`);

  const sectionHits = new Map<string, number>();
  for (const r of rows) for (const s of r.changedSections) sectionHits.set(s, (sectionHits.get(s) ?? 0) + 1);
  console.log("Секции, где правила отличаются от дефолта:");
  for (const s of SECTIONS) console.log(`  ${String(s)}: ${sectionHits.get(String(s)) ?? 0}`);

  const retried = rows.filter((r) => r.retriedCompact).length;
  const prefiltered = rows.filter((r) => (r.droppedChars ?? 0) > 0).length;
  console.log(`Компактных повторов: ${retried} · с предфильтром: ${prefiltered}`);
  console.log(`Потрачено: $${spent.toFixed(4)} из потолка $${HARD_CAP_USD.toFixed(2)}`);
}

async function main(): Promise<void> {
  if (!fs.existsSync(DOCS_DIR)) {
    throw new Error(`Нет корпуса ${DOCS_DIR} — сначала npx tsx scripts/guidelines/export-guidelines.ts`);
  }
  const limit = parseLimit(process.argv.slice(2));
  const docs = pickDocs(limit);
  console.log(`Проверяем ${docs.length} методичек (лимит ${limit}), потолок $${HARD_CAP_USD.toFixed(2)}`);

  const rows: Row[] = [];
  let spent = 0;
  for (const [i, id] of docs.entries()) {
    if (spent >= HARD_CAP_USD) {
      console.warn(`Потолок $${HARD_CAP_USD} достигнут, остановка на ${i} из ${docs.length}`);
      break;
    }
    const text = fs.readFileSync(path.join(DOCS_DIR, `${id}.txt`), "utf8");
    console.log(`[${i + 1}/${docs.length}] ${id} (${text.length} символов)`);
    const row = await runDoc(id, text);
    spent += row.costUsd;
    rows.push(row);
    console.log(
      `  ${row.status}${row.reason ? `:${row.reason}` : ""} · отличается от ГОСТ: ${row.differs ? "да" : "нет"} · $${spent.toFixed(4)}`
    );
  }

  report(rows, spent);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
