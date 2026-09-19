/**
 * B2 (role-bench, w38/26-role-bench): export T0 verdicts for one docx (or a
 * whole directory) as a CSV the owner edits by hand — the `gold` column,
 * prefilled with the T0 role, is where corrections go. Read by
 * `labels-import.ts` afterwards.
 *
 * Output goes to `data/golden/labels-work/` by default. That directory
 * contains paragraph text and is gitignored — never commit it.
 *
 * HARD RULE: this script may read and process real docx files, but must
 * never print their text to the console or into a committed file. Only ids,
 * indices, roles, counts reach stdout / docs.
 *
 *   npx tsx scripts/pipeline-v7/labels-export.ts --file=data/corpus/real/<id>.docx
 *   npx tsx scripts/pipeline-v7/labels-export.ts --dir=data/corpus/real
 *   npx tsx scripts/pipeline-v7/labels-export.ts --dir=data/corpus/real --limit=15
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import type { ClassificationResult, ClassifiedParagraph } from "@/lib/pipeline-v7/classify/types";

const DEFAULT_DIR = "data/corpus/real";
const DEFAULT_OUT = "data/golden/labels-work";
const TEXT_LEN = 120;
const LOW_CONFIDENCE = 0.85;

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function csvField(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADER = [
  "i",
  "text",
  "styleId",
  "boldAll",
  "capsRatio",
  "jc",
  "sz",
  "numPr",
  "keepNext",
  "inTable",
  "t0_role",
  "confidence",
  "source",
  "gold",
];

function toCsv(result: ClassificationResult): string {
  const lines = [CSV_HEADER.join(",")];
  result.list.forEach((cp: ClassifiedParagraph, i: number) => {
    const f = cp.features;
    const numPr = f?.numPr ? `${f.numPr.numId ?? ""}:${f.numPr.ilvl}` : "";
    const inTable = cp.path.includes("w:tbl[");
    const row = [
      i,
      (cp.text ?? "").slice(0, TEXT_LEN),
      f?.styleId ?? "",
      f?.boldAll ?? false,
      f?.capsRatio !== undefined ? f.capsRatio.toFixed(2) : "",
      f?.jc ?? "",
      f?.sz ?? "",
      numPr,
      f?.keepNext ?? false,
      inTable,
      cp.role,
      cp.confidence.toFixed(2),
      cp.source,
      cp.role, // gold, prefilled with t0_role — owner edits this column
    ];
    lines.push(row.map(csvField).join(","));
  });
  return lines.join("\n") + "\n";
}

function docIdOf(file: string): string {
  return basename(file, extname(file));
}

async function classifyFile(path: string): Promise<ClassificationResult> {
  const pkg = await DocxPackage.load(readFileSync(path));
  return classifyDocument(pkg);
}

function rankScore(result: ClassificationResult): { unknownCount: number; lowConfCount: number } {
  let unknownCount = 0;
  let lowConfCount = 0;
  for (const cp of result.list) {
    if (cp.role === "unknown") unknownCount++;
    else if (cp.confidence < LOW_CONFIDENCE) lowConfCount++;
  }
  return { unknownCount, lowConfCount };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ?? DEFAULT_OUT;
  mkdirSync(outDir, { recursive: true });

  let files: string[];
  if (args.file) {
    files = [args.file];
  } else {
    const dir = args.dir ?? DEFAULT_DIR;
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".docx"))
      .map((f) => join(dir, f));
  }

  if (files.length === 0) {
    console.error("No .docx files to process.");
    process.exit(1);
  }

  const ranked: Array<{ id: string; unknownCount: number; lowConfCount: number; total: number }> = [];

  for (const file of files) {
    const id = docIdOf(file);
    const result = await classifyFile(file);
    const { unknownCount, lowConfCount } = rankScore(result);
    ranked.push({ id, unknownCount, lowConfCount, total: result.list.length });

    const csv = toCsv(result);
    const outPath = join(outDir, `${id}.csv`);
    writeFileSync(outPath, csv);
    console.log(`  ${id}: paragraphs=${result.list.length} unknown=${unknownCount} lowConf=${lowConfCount} -> ${outPath}`);
  }

  if (files.length > 1) {
    ranked.sort((a, b) => b.unknownCount + b.lowConfCount - (a.unknownCount + a.lowConfCount));
    console.log("\n=== Ranking by unknown + low-confidence count (label these first) ===");
    console.table(
      ranked.map((r) => ({
        id: r.id,
        unknown: r.unknownCount,
        lowConfidence: r.lowConfCount,
        total: r.total,
      }))
    );
  }

  const limit = args.limit ? Number(args.limit) : undefined;
  if (limit) {
    console.log(`\nTop ${limit} by unknown+lowConf (ids only, for --file re-runs if needed):`);
    console.log(
      ranked
        .slice(0, limit)
        .map((r) => r.id)
        .join(", ")
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
