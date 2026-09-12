// Детерминированно генерирует 12 синтетических .docx (по одному на хазард
// живучести контента для OOXML-рестайлера pipeline-v7) в
// data/corpus/synthetic/ + manifest.json с точными счётчиками маркеров,
// которые обязан пройти fidelity gate. `--verify` перегенерирует всё в
// памяти и сверяет байт-в-байт с уже записанными файлами + со значениями в
// manifest.json, не полагаясь на диск как источник истины.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { build as build01 } from "./make-corpus/docs/01-merged-cells";
import { build as build02 } from "./make-corpus/docs/02-nested-tables";
import { build as build03 } from "./make-corpus/docs/03-footnotes-endnotes";
import { build as build04 } from "./make-corpus/docs/04-crossrefs";
import { build as build05 } from "./make-corpus/docs/05-multi-section";
import { build as build06 } from "./make-corpus/docs/06-headers-footers";
import { build as build07 } from "./make-corpus/docs/07-lists";
import { build as build08 } from "./make-corpus/docs/08-images-captions";
import { build as build09 } from "./make-corpus/docs/09-formulas";
import { build as build10 } from "./make-corpus/docs/10-existing-toc";
import { build as build11 } from "./make-corpus/docs/11-bibliography-15";
import { build as build12 } from "./make-corpus/docs/12-no-styles";
import type { DocBuildResult, ManifestEntry } from "./make-corpus/docs/types";

const BUILDERS: (() => Promise<DocBuildResult>)[] = [
  build01,
  build02,
  build03,
  build04,
  build05,
  build06,
  build07,
  build08,
  build09,
  build10,
  build11,
  build12,
];

const OUT_DIR = join(__dirname, "..", "..", "data", "corpus", "synthetic");
const MANIFEST_PATH = join(OUT_DIR, "manifest.json");

function manifestEntry(r: DocBuildResult): ManifestEntry {
  return { file: r.file, hazard: r.hazard, mustSurvive: r.mustSurvive };
}

async function generate(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest: ManifestEntry[] = [];
  for (const builder of BUILDERS) {
    const result = await builder();
    writeFileSync(join(OUT_DIR, result.file), result.buffer);
    manifest.push(manifestEntry(result));
    console.log(`wrote ${result.file}  (${result.hazard})  mustSurvive=${JSON.stringify(result.mustSurvive)}`);
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nmanifest written: ${MANIFEST_PATH}`);
}

function deepEqualCounts(a: Record<string, number>, b: Record<string, number>): string[] {
  const problems: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) {
      problems.push(`  ${key}: expected ${a[key]}, got ${b[key]}`);
    }
  }
  return problems;
}

async function verify(): Promise<void> {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`manifest not found: ${MANIFEST_PATH} — run without --verify first`);
    process.exit(1);
  }
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  let failures = 0;

  for (let i = 0; i < BUILDERS.length; i++) {
    const result = await BUILDERS[i]();
    const expected = manifest[i];
    const filePath = join(OUT_DIR, result.file);

    if (!expected || expected.file !== result.file) {
      console.error(`✗ ${result.file}: not found at expected manifest position ${i}`);
      failures++;
      continue;
    }

    const countProblems = deepEqualCounts(expected.mustSurvive, result.mustSurvive);
    if (countProblems.length > 0) {
      console.error(`✗ ${result.file}: mustSurvive mismatch vs manifest.json\n${countProblems.join("\n")}`);
      failures++;
    }

    if (!existsSync(filePath)) {
      console.error(`✗ ${result.file}: file missing on disk at ${filePath}`);
      failures++;
      continue;
    }
    const onDisk = readFileSync(filePath);
    if (!onDisk.equals(result.buffer)) {
      console.error(`✗ ${result.file}: regenerated buffer differs from file on disk (non-determinism or stale file)`);
      failures++;
    }

    if (countProblems.length === 0 && onDisk.equals(result.buffer)) {
      console.log(`✓ ${result.file}: mustSurvive OK, byte-identical to disk`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${BUILDERS.length} documents verified.`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--verify")) {
    await verify();
  } else {
    await generate();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
