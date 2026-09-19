/**
 * Визуальный бенч pipeline-v7: метрики по ОТРЕНДЕРЕННОМУ документу.
 *
 * Зачем: XML-чекер (`pipeline-v6/checker`) ставит 97–99/100 документам, которые
 * пользователь оценивает на 1★. Всё, что он не видит, живёт в вёрстке — число
 * страниц, порядок заголовков, номера в содержании, уцелевший титул. Этот бенч
 * рендерит исходник и выход через LibreOffice и меряет именно их.
 *
 * Прогон идёт по прод-конфигурации: `llm: undefined`, `textNormalization: true`
 * (как в `src/lib/pipeline-v7/try-v7.ts`), затем `fillTocStatic` — как в
 * `src/lib/processing/gost-job.ts`. Платных вызовов LLM нет.
 *
 * Usage:
 *   npx tsx scripts/pipeline-v7/bench-visual.ts [--set=real|synthetic|all]
 *     [--id=<substr>] [--out=<dir>] [--golden=<dir>] [--accept]
 *
 * PRIVACY: в отчёты идут id, числа и коды флагов. Текст заголовков попадает в
 * JSON только для синтетического набора; реальные документы приватны.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { GOST_7_32 } from "../../src/lib/pipeline-v6/rule-packs/gost-7-32";
import { runPipelineV7 } from "../../src/lib/pipeline-v7/orchestrator";
import { fillTocStatic } from "../../src/lib/pipeline-v7/aux/toc-static";
import { hasBinary, render, renderCached, type Rendered } from "./visual/render";
import {
  classifiedHeadings,
  diffPdf,
  firstPageIsTitle,
  headingOrder,
  introBeforeChapters,
  tocCheck,
  tocEntries,
} from "./visual/metrics";
import {
  computeFlags,
  flagged,
  summary,
  table,
  tocDeltaSection,
  type VisualRow,
} from "./visual/report";

const SYNTHETIC_DIR = "data/corpus/synthetic";
const REAL_DIR = "/Users/sergejpilipenko/diplox/data/corpus/real";
const CACHE_DIR = "/tmp/v7-visual/.src-cache";

interface Doc {
  id: string;
  set: "synthetic" | "real";
  file: string;
}

function listDocs(set: string, idFilter?: string): Doc[] {
  const docs: Doc[] = [];
  const add = (dir: string, s: "synthetic" | "real") => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".docx")).sort()) {
      docs.push({ id: f.replace(/\.docx$/, ""), set: s, file: path.join(dir, f) });
    }
  };
  if (set === "synthetic" || set === "all") add(SYNTHETIC_DIR, "synthetic");
  if (set === "real" || set === "all") add(REAL_DIR, "real");
  return idFilter ? docs.filter((d) => d.id.includes(idFilter)) : docs;
}

function emptyRow(doc: Doc): VisualRow {
  return {
    id: doc.id,
    set: doc.set,
    ms: 0,
    gate: null,
    refused: false,
    pagesBefore: null,
    pagesAfter: null,
    pagesRatio: null,
    headings: { total: 0, resolved: 0, firstMissing: null, firstMissingLevel: null },
    toc: { status: "no-entries", entries: 0, mismatches: 0, notListed: 0, mismatchIndexes: [], deltas: {} },
    intro: "n/a",
    title: "n/a",
    diff: null,
    flags: [],
  };
}

interface Ctx {
  outDir: string;
  goldenDir: string | null;
  accept: boolean;
  canDiff: boolean;
}

/** Прод-путь: v7 → статическое заполнение кэша поля TOC. */
async function produce(input: Buffer, id: string) {
  const r = await runPipelineV7(input, {
    pack: GOST_7_32,
    documentId: id,
    textNormalization: true,
    llm: undefined,
    returnOnGateFail: true,
  });
  if (!r.output) return { r, output: undefined, filled: 0, tocSkipped: "gate-fail" };
  const toc = await fillTocStatic(r.output);
  return { r, output: toc.output, filled: toc.filled, tocSkipped: toc.skipped };
}

/** Метрики по паре рендеров выхода: с обновлением полей и без него. */
async function measure(
  row: VisualRow,
  input: Buffer,
  src: Rendered,
  live: Rendered,
  cached: Rendered
) {
  const headings = await classifiedHeadings(input);
  const { result, pages } = headingOrder(headings, live.pages, row.set === "synthetic");
  row.headings = result;
  row.toc = { ...row.toc, ...tocCheck(headings, tocEntries(cached.pages), pages) };
  row.intro = introBeforeChapters(headings);
  row.title = firstPageIsTitle(src.pages, live.pages);
}

async function benchDoc(doc: Doc, ctx: Ctx): Promise<VisualRow> {
  const row = emptyRow(doc);
  const input = fs.readFileSync(doc.file);
  const src = renderCached(input, CACHE_DIR);
  row.pagesBefore = src.pageCount;

  const t0 = Date.now();
  let produced;
  try {
    produced = await produce(input, doc.id);
  } catch (err) {
    row.ms = Date.now() - t0;
    row.error = (err instanceof Error ? err.message : String(err)).slice(0, 120);
    row.flags = computeFlags(row);
    return row;
  }
  row.ms = Date.now() - t0;
  row.gate = produced.r.report.gate.pass;
  row.refused = produced.r.report.refused !== undefined;

  const output = produced.output;
  if (!output) {
    row.flags = computeFlags(row);
    return row;
  }
  fs.writeFileSync(path.join(ctx.outDir, `${doc.id}.docx`), output);

  // Два рендера одного и того же выхода: с UpdateFields — истина вёрстки,
  // без — кэш поля TOC, который увидит не обновляющий поля просмотрщик.
  const live = render(output, ctx.outDir, doc.id, { updateFields: true });
  const cached = render(output, path.join(ctx.outDir, "cached"), doc.id, { updateFields: false });
  row.pagesAfter = live.pageCount;
  if (row.pagesBefore && row.pagesAfter) row.pagesRatio = row.pagesAfter / row.pagesBefore;

  if (live.pages.length) await measure(row, input, src, live, cached);
  row.toc.filled = produced.filled;
  if (produced.tocSkipped) row.toc.tocSkipped = produced.tocSkipped;
  row.diff = goldenCompare(doc, live.pdfPath, ctx);
  row.flags = computeFlags(row);
  return row;
}

/** Сравнение с golden и/или запись нового golden по `--accept`. */
function goldenCompare(doc: Doc, pdfPath: string, ctx: Ctx): boolean | null {
  if (!ctx.goldenDir || !pdfPath) return null;
  const goldenPath = path.join(ctx.goldenDir, `${doc.id}.pdf`);
  if (ctx.accept) {
    fs.mkdirSync(ctx.goldenDir, { recursive: true });
    fs.copyFileSync(pdfPath, goldenPath);
    return null;
  }
  if (!ctx.canDiff || !fs.existsSync(goldenPath)) return null;
  return diffPdf(goldenPath, pdfPath);
}

function buildMarkdown(rows: VisualRow[], ctx: Ctx, note: string): string {
  return [
    `# Визуальный бенч pipeline-v7 — ${new Date().toISOString()}`,
    "",
    table(rows),
    "",
    "## Итоги",
    ...summary(rows).map((l) => `- ${l}`),
    "",
    "## Расхождения номеров в содержании",
    ...tocDeltaSection(rows).map((l) => `- ${l}`),
    "",
    "## Документы с флагами",
    ...(flagged(rows).length ? flagged(rows).map((l) => `- ${l}`) : ["- нет"]),
    "",
    "## Примечания",
    `- ${note}`,
    `- выход: ${ctx.outDir}`,
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const value = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = value("out") ?? `/tmp/v7-visual/${stamp}`;
  const accept = args.includes("--accept");
  const goldenDir = value("golden") ?? (accept ? path.join(outDir, "..", "golden") : null);
  const canDiff = hasBinary("diff-pdf");
  fs.mkdirSync(outDir, { recursive: true });

  const docs = listDocs(value("set") ?? "all", value("id"));
  const note = canDiff
    ? "пиксельный diff: diff-pdf найден на PATH"
    : "пиксельный diff пропущен — diff-pdf не установлен (новая зависимость требует решения владельца)";
  console.log(`[visual] документов: ${docs.length}, вывод: ${outDir}\n[visual] ${note}`);

  const ctx: Ctx = { outDir, goldenDir, accept, canDiff };
  const rows: VisualRow[] = [];
  for (let i = 0; i < docs.length; i++) {
    const row = await benchDoc(docs[i], ctx);
    rows.push(row);
    console.log(
      `[${i + 1}/${docs.length}] ${row.id.slice(0, 22)} ` +
        `стр ${row.pagesBefore ?? "—"}→${row.pagesAfter ?? "—"} ` +
        `заг ${row.headings.resolved}/${row.headings.total} ` +
        `toc ${row.toc.mismatches}/${row.toc.entries} ` +
        `флаги: ${row.flags.join(" ") || "—"}`
    );
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ outDir, rows }, null, 2));
  }

  const md = buildMarkdown(rows, ctx, note);
  fs.writeFileSync(path.join(outDir, "report.md"), md);
  fs.rmSync(path.join(outDir, ".work"), { recursive: true, force: true });
  fs.rmSync(path.join(outDir, "cached", ".work"), { recursive: true, force: true });
  console.log(`\n${md}\n\n[visual] отчёты: ${outDir}/report.{json,md}`);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
