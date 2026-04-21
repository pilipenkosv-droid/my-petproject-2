// Run v6 on one doc and print which checks fail with examples.
import * as fs from "fs";
import * as path from "path";
import { runPipelineV6 } from "../../src/lib/pipeline-v6/orchestrator";

const REFERENCE_DOC = path.join(process.cwd(), "scripts/pipeline-v6/spike-pandoc/reference-gost.docx");

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: inspect-fail <path>");
  const buf = fs.readFileSync(file);
  const res = await runPipelineV6(buf, {
    documentId: path.basename(file),
    referenceDoc: REFERENCE_DOC,
    rewrite: false,
    metadata: { title: path.basename(file), lang: "ru" },
    fixIterations: 2,
  });
  console.log(`score: ${res.finalReport.score} (initial ${res.initialReport.score})`);
  for (const c of res.finalReport.checks) {
    if (!c.passed) {
      console.log(`  FAIL ${c.id} — ${c.actual}`);
      if ((c as { examples?: string[] }).examples) {
        for (const ex of (c as { examples: string[] }).examples.slice(0, 2)) console.log(`    ${ex}`);
      }
    }
  }
}

main().catch(console.error);
