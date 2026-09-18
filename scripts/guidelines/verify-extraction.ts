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

/** Жёсткий потолок расходов; переопределяется аргументом --cap. */
const DEFAULT_CAP_USD = 0.5;
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
  schemaMode?: string;
  finishReason?: string;
  /** Режим отбора фрагментов; «—» = методичка ушла целиком. */
  retrievalMode?: string;
  unitsTotal?: number;
  unitsSelected?: number;
  retrievalCharsOut?: number;
  retrievalMs?: number;
  retrievalCostUsd?: number;
  retrievalFallback?: string;
  /** Сколько секций правил модель снабдила номерами фрагментов. */
  provenanceSections?: number;
  /** Сколько отобранных единиц упомянуто хотя бы в одной секции. */
  provenanceUnits?: number;
  /** Номеров, которых в контексте не было (модель их выдумала). */
  provenanceBogus?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
}

function parseCap(argv: string[]): number {
  const flag = argv.indexOf("--cap");
  return flag >= 0 && argv[flag + 1] ? Number(argv[flag + 1]) : DEFAULT_CAP_USD;
}

function parseLimit(argv: string[]): number {
  const flag = argv.indexOf("--limit");
  if (flag >= 0 && argv[flag + 1]) return Number(argv[flag + 1]);
  const capAt = argv.indexOf("--cap");
  const positional = argv.find((a, i) => /^\d+$/.test(a) && i !== capAt + 1);
  return positional ? Number(positional) : 15;
}

function parseMinChars(argv: string[]): number {
  const flag = argv.indexOf("--min-chars");
  return flag >= 0 && argv[flag + 1] ? Number(argv[flag + 1]) : 0;
}

/** Документы эталона — первыми, дальше остальные по возрастанию длины. */
function pickDocs(limit: number, minChars: number): string[] {
  const all = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4));
  const goldFile = path.join(GOLD_DIR, "index.json");
  const gold = fs.existsSync(goldFile) ? Object.keys(readJson<Record<string, unknown>>(goldFile)) : [];
  const ordered = [...gold.filter((id) => all.includes(id)), ...all.filter((id) => !gold.includes(id))];
  // --min-chars отсекает короткие методички: они идут полным текстом,
  // и на проверке ретрива тратить на них деньги незачем.
  const big = minChars
    ? ordered.filter((id) => fs.statSync(path.join(DOCS_DIR, `${id}.txt`)).size >= minChars)
    : ordered;
  return big.slice(0, limit);
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
      (res.usage?.inputTokens ?? 0) * PRICE_IN +
      (res.usage?.outputTokens ?? 0) * PRICE_OUT +
      (res.retrieval?.costUsd ?? 0);
    // Провенанс засчитываем только по номерам, которые реально были в контексте.
    const selected = new Set(res.retrievalUnitIds ?? []);
    const entries = Object.entries(res.provenance ?? {}).map(
      ([section, ids]) => [section, (ids ?? []).filter((n) => selected.has(n))] as const
    );
    const validSections = entries.filter(([, ids]) => ids.length > 0);
    const provenanceIds = new Set(validSections.flatMap(([, ids]) => ids));
    const bogus = Object.values(res.provenance ?? {}).flat().filter((n) => !selected.has(n)).length;
    return {
      ...base,
      retrievalMode: res.retrieval?.mode,
      unitsTotal: res.retrieval?.unitsTotal,
      unitsSelected: res.retrieval?.unitsSelected,
      retrievalCharsOut: res.retrieval?.charsOut,
      retrievalMs: res.retrieval ? res.retrieval.embedMs + res.retrieval.rerankMs : undefined,
      retrievalCostUsd: res.retrieval?.costUsd,
      retrievalFallback: res.retrieval?.fallbackReason,
      provenanceSections: validSections.length,
      provenanceUnits: provenanceIds.size,
      provenanceBogus: bogus,
      status: res.normalized ? "normalized" : "ok",
      differs: !isDeepStrictEqual(rules, DEFAULT_GOST_RULES),
      changedSections: changedSections(rules),
      confidence: res.confidence,
      droppedChars: res.droppedChars,
      retriedCompact: res.retriedCompact,
      schemaMode: res.schemaMode,
      inputTokens: res.usage?.inputTokens,
      outputTokens: res.usage?.outputTokens,
      costUsd,
    };
  } catch (error) {
    const reason = error instanceof RulesExtractionError ? error.reason : "unknown";
    console.error(`  ! ${id}: ${reason} — ${error instanceof Error ? error.message.slice(0, 160) : error}`);
    // Стоимость неудачного вызова шлюз здесь не отдаёт — считаем по входу.
    return { ...base, status: "error", reason, costUsd: (text.length / 4) * PRICE_IN };
  }
}

/** Отдельный блок отчёта: что сделал ретрив и насколько полон провенанс. */
function reportRetrieval(rows: Row[]): void {
  const withRetrieval = rows.filter((r) => r.retrievalMode);
  console.log(`\nРетрив применялся: ${withRetrieval.length} из ${rows.length} документов`);
  if (withRetrieval.length === 0) return;

  const modes = new Map<string, number>();
  for (const r of withRetrieval) modes.set(r.retrievalMode!, (modes.get(r.retrievalMode!) ?? 0) + 1);
  console.log(`  Режимы: ${[...modes].map(([m, n]) => `${m}=${n}`).join(" · ")}`);
  for (const r of withRetrieval.filter((x) => x.retrievalFallback)) {
    console.log(`  ! ${r.id}: откат — ${r.retrievalFallback!.slice(0, 120)}`);
  }

  const totalIn = withRetrieval.reduce((n, r) => n + r.chars, 0);
  const totalOut = withRetrieval.reduce((n, r) => n + (r.retrievalCharsOut ?? 0), 0);
  const ms = withRetrieval.reduce((n, r) => n + (r.retrievalMs ?? 0), 0) / withRetrieval.length;
  const cost = withRetrieval.reduce((n, r) => n + (r.retrievalCostUsd ?? 0), 0);
  console.log(
    `  Символов: ${totalIn} → ${totalOut} (${((totalOut / totalIn) * 100).toFixed(1)} %) · ` +
      `среднее время ${Math.round(ms)} мс · $${cost.toFixed(5)} за ${withRetrieval.length} док.`
  );

  // Покрытие провенансом: сколько секций правил модель связала с фрагментами.
  const withProvenance = withRetrieval.filter((r) => (r.provenanceSections ?? 0) > 0);
  const sections = withRetrieval.reduce((n, r) => n + (r.provenanceSections ?? 0), 0);
  const bogus = withRetrieval.reduce((n, r) => n + (r.provenanceBogus ?? 0), 0);
  console.log(
    `  Провенанс вернули: ${withProvenance.length} из ${withRetrieval.length} · ` +
      `секций в среднем ${(sections / withRetrieval.length).toFixed(1)} из ${SECTIONS.length} ` +
      `(${((sections / (withRetrieval.length * SECTIONS.length)) * 100).toFixed(0)} % покрытия) · ` +
      `выдуманных номеров: ${bogus}`
  );
}

function report(rows: Row[], spent: number, cap: number): void {
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

  reportRetrieval(rows);

  const retried = rows.filter((r) => r.retriedCompact).length;
  const prefiltered = rows.filter((r) => (r.droppedChars ?? 0) > 0).length;
  console.log(`Компактных повторов: ${retried} · с предфильтром: ${prefiltered}`);
  const modes = new Map<string, number>();
  for (const r of rows) if (r.schemaMode) modes.set(r.schemaMode, (modes.get(r.schemaMode) ?? 0) + 1);
  console.log(`Режим схемы: ${[...modes].map(([m, n]) => `${m}=${n}`).join(" · ") || "—"}`);
  const tokensIn = rows.reduce((n, r) => n + (r.inputTokens ?? 0), 0);
  const tokensOut = rows.reduce((n, r) => n + (r.outputTokens ?? 0), 0);
  console.log(`Токенов: вход ${tokensIn} · выход ${tokensOut}`);
  console.log(`Потрачено: $${spent.toFixed(4)} из потолка $${cap.toFixed(2)}`);

  console.log("\nПо документам:");
  console.log(
    "id · симв · статус · ≠ГОСТ · секции · ретрив · единиц · провенанс · компакт · снято · in/out · $"
  );
  for (const r of rows) {
    console.log(
      [
        r.id, r.chars, r.status + (r.reason ? `:${r.reason}` : ""),
        r.differs ? "да" : "нет", r.changedSections.join("+") || "—",
        r.retrievalMode ?? "—",
        r.retrievalMode ? `${r.unitsSelected}/${r.unitsTotal}` : "—",
        r.retrievalMode ? `${r.provenanceSections ?? 0}/${SECTIONS.length}·${r.provenanceUnits ?? 0}` : "—",
        r.retriedCompact ? "да" : "нет", r.droppedChars ?? 0,
        `${r.inputTokens ?? 0}/${r.outputTokens ?? 0}`, `$${r.costUsd.toFixed(4)}`,
      ].join(" · ")
    );
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(DOCS_DIR)) {
    throw new Error(`Нет корпуса ${DOCS_DIR} — сначала npx tsx scripts/guidelines/export-guidelines.ts`);
  }
  const argv = process.argv.slice(2);
  const limit = parseLimit(argv);
  const cap = parseCap(argv);
  const minChars = parseMinChars(argv);
  const docs = pickDocs(limit, minChars);
  console.log(
    `Проверяем ${docs.length} методичек (лимит ${limit}` +
      `${minChars ? `, от ${minChars} байт` : ""}), потолок $${cap.toFixed(2)}`
  );

  const rows: Row[] = [];
  let spent = 0;
  for (const [i, id] of docs.entries()) {
    if (spent >= cap) {
      console.warn(`Потолок $${cap} достигнут, остановка на ${i} из ${docs.length}`);
      break;
    }
    const text = fs.readFileSync(path.join(DOCS_DIR, `${id}.txt`), "utf8");
    console.log(`[${i + 1}/${docs.length}] ${id} (${text.length} символов)`);
    const row = await runDoc(id, text);
    spent += row.costUsd;
    rows.push(row);
    console.log(
      `  ${row.status}${row.reason ? `:${row.reason}` : ""} · схема: ${row.schemaMode ?? "—"}` +
        ` · отличается от ГОСТ: ${row.differs ? "да" : "нет"}` +
        ` · токены ${row.inputTokens ?? 0}/${row.outputTokens ?? 0} · потрачено $${spent.toFixed(4)}`
    );
  }

  report(rows, spent, cap);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
