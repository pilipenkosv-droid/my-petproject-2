/**
 * Reproduces the `Cannot read properties of undefined (reading '#text')` crash
 * on two real corpus documents. Prints ONLY stack traces and counts.
 *
 * PRIVACY: never prints document text.
 *
 * Usage: npx tsx scripts/pipeline-v7/repro-text-crash.ts
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  parseDocxStructure,
  enrichWithBlockMarkup,
  analyzeDocument,
} from "../../src/lib/pipeline/document-analyzer";
import { formatDocument } from "../../src/lib/pipeline/document-formatter";
import { mergeWithDefaults } from "../../src/lib/ai/provider";

const CORPUS_DIR = "data/corpus/real";
const FILES = ["pQftKzzzQICAPqVunxD_X.docx", "-1ExM2BQ6RjTYv__K6UnW.docx"];

async function run(file: string) {
  const id = file.slice(0, 8);
  console.log(`\n=== ${id} ===`);
  const buf = fs.readFileSync(path.join(CORPUS_DIR, file));
  const rules = mergeWithDefaults({});
  const t0 = Date.now();
  try {
    const s = await parseDocxStructure(buf);
    const m = await enrichWithBlockMarkup(s.paragraphs);
    const a = await analyzeDocument(buf, rules, m.paragraphs);
    await formatDocument(buf, rules, a.violations, m.paragraphs, "trial");
    console.log(`ok  totalMs=${Date.now() - t0}`);
  } catch (err) {
    console.log(`FAIL totalMs=${Date.now() - t0}`);
    console.log(err instanceof Error ? err.stack : String(err));
  }
}

(async () => {
  for (const f of FILES) await run(f);
})();
