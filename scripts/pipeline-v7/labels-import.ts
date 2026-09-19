/**
 * B2 (role-bench, w38/26-role-bench): import the owner's edited `gold`
 * column from `labels-export.ts` CSVs and write the committable label files
 * `data/golden/labels/<docId>.json` — index + role only, no text, so these
 * are safe to commit (unlike the CSVs in `data/golden/labels-work/`).
 *
 *   npx tsx scripts/pipeline-v7/labels-import.ts --file=data/golden/labels-work/<id>.csv
 *   npx tsx scripts/pipeline-v7/labels-import.ts --dir=data/golden/labels-work
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

import { ROLES } from "@/lib/pipeline-v7/classify/types";
import type { Role } from "@/lib/pipeline-v7/classify/types";

const DEFAULT_IN = "data/golden/labels-work";
const DEFAULT_OUT = "data/golden/labels";

const VALID_ROLES = new Set<string>(ROLES);

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Minimal RFC4180 CSV parser — handles quoted fields with embedded commas/newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

interface ImportResult {
  documentId: string;
  labels: Array<{ i: number; role: Role }>;
  errors: string[];
  emptyGoldDefaulted: number;
}

function importCsv(path: string): ImportResult {
  const documentId = basename(path, extname(path));
  const text = readFileSync(path, "utf8");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { documentId, labels: [], errors: ["empty file"], emptyGoldDefaulted: 0 };
  }
  const header = rows[0];
  const iCol = header.indexOf("i");
  const t0Col = header.indexOf("t0_role");
  const goldCol = header.indexOf("gold");
  if (iCol === -1 || goldCol === -1) {
    return { documentId, labels: [], errors: [`missing required column(s): i/gold in header ${header.join("|")}`], emptyGoldDefaulted: 0 };
  }

  const labels: Array<{ i: number; role: Role }> = [];
  const errors: string[] = [];
  let emptyGoldDefaulted = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length <= iCol) continue;
    const iRaw = cells[iCol];
    const i = Number(iRaw);
    if (!Number.isInteger(i)) {
      errors.push(`row ${r}: invalid index "${iRaw}"`);
      continue;
    }
    let gold = (cells[goldCol] ?? "").trim();
    if (gold === "") {
      gold = t0Col !== -1 ? (cells[t0Col] ?? "").trim() : "";
      if (gold !== "") emptyGoldDefaulted++;
    }
    if (gold === "" || !VALID_ROLES.has(gold)) {
      errors.push(`row ${r} (i=${i}): invalid role "${gold}"`);
      continue;
    }
    labels.push({ i, role: gold as Role });
  }

  return { documentId, labels, errors, emptyGoldDefaulted };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ?? DEFAULT_OUT;
  mkdirSync(outDir, { recursive: true });

  let files: string[];
  if (args.file) {
    files = [args.file];
  } else {
    const dir = args.dir ?? DEFAULT_IN;
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".csv"))
      .map((f) => join(dir, f));
  }

  if (files.length === 0) {
    console.error("No .csv files to import.");
    process.exit(1);
  }

  let anyFailed = false;
  for (const file of files) {
    const { documentId, labels, errors, emptyGoldDefaulted } = importCsv(file);
    if (errors.length > 0) {
      anyFailed = true;
      console.error(`FAIL ${documentId}: ${errors.length} invalid row(s)`);
      for (const e of errors.slice(0, 20)) console.error(`  ${e}`);
      if (errors.length > 20) console.error(`  ...and ${errors.length - 20} more`);
      continue;
    }
    const payload = {
      documentId,
      source: "manual",
      createdAt: new Date().toISOString(),
      labels,
    };
    const outPath = join(outDir, `${documentId}.json`);
    writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
    console.log(
      `OK ${documentId}: ${labels.length} labels${emptyGoldDefaulted ? ` (${emptyGoldDefaulted} empty gold defaulted to t0_role)` : ""} -> ${outPath}`
    );
  }

  if (anyFailed) process.exit(1);
}

export { parseCsv, importCsv };

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
