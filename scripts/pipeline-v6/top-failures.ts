// Runs v6 on every golden doc and aggregates which checks fail most often.
// Usage: npx tsx scripts/pipeline-v6/top-failures.ts

import * as fs from "fs";
import * as path from "path";
import { runPipelineV6 } from "../../src/lib/pipeline-v6/orchestrator";

const GOLDEN_DIR = path.join(process.cwd(), "data/golden/raw");
const REFERENCE_DOC = path.join(process.cwd(), "scripts/pipeline-v6/spike-pandoc/reference-gost.docx");

async function main() {
  const files = fs.readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".docx"));
  const fail: Record<string, number> = {};
  let total = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(GOLDEN_DIR, f));
    try {
      const res = await runPipelineV6(buf, {
        documentId: f,
        referenceDoc: REFERENCE_DOC,
        rewrite: false,
        metadata: { title: f, lang: "ru" },
        fixIterations: 1,
      });
      total++;
      for (const c of res.finalReport.checks) {
        if (!c.passed) fail[c.id] = (fail[c.id] ?? 0) + 1;
      }
    } catch {
      // skip
    }
  }
  const sorted = Object.entries(fail).sort((a, b) => b[1] - a[1]);
  console.log(`Top failing checks across ${total} v6 outputs:`);
  for (const [id, n] of sorted) {
    const pct = ((n / total) * 100).toFixed(0);
    console.log(`  ${id.padEnd(40)} ${n}/${total} (${pct}%)`);
  }
}

main().catch(console.error);
