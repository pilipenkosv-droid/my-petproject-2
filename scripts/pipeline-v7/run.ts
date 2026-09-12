/**
 * Runs pipeline-v7 on a single .docx.
 *
 * Usage:
 *   npx tsx scripts/pipeline-v7/run.ts <in.docx> <out.docx> \
 *     [--pack gost-7.32] [--no-llm] [--json] [--allow-gate-fail] [--text-norm]
 *
 * Exit codes: 0 ok, 1 crash, 2 fidelity gate failed (writes <out>.diff.json).
 *
 * PRIVACY: prints paths, roles, counts and rule codes — never document text.
 */

import * as fs from "fs";
import * as path from "path";
import { runPipelineV7 } from "../../src/lib/pipeline-v7/orchestrator";
import { formatReportText, toJson } from "../../src/lib/pipeline-v7/report";

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const inPath = positional[0];
  const outPath = positional[1];
  if (!inPath || !outPath) {
    console.error(
      "usage: run.ts <in.docx> <out.docx> [--pack slug] [--no-llm] [--json] [--allow-gate-fail] [--text-norm]"
    );
    process.exit(1);
  }
  // --no-llm is the only mode available: the residue layer lives behind
  // opts.llm and no implementation is wired in yet.
  const packSlug = flagValue(args, "pack");
  const asJson = args.includes("--json");
  const allowGateFail = args.includes("--allow-gate-fail");
  const textNormalization = args.includes("--text-norm");

  const input = fs.readFileSync(inPath);
  const documentId = path.basename(inPath, ".docx");

  // returnOnGateFail is always on here so a failing run can still be written
  // out as a diff; the buffer is only ever saved when the gate passes.
  const result = await runPipelineV7(input, { packSlug, documentId, returnOnGateFail: true, textNormalization });

  console.log(asJson ? toJson(result.report) : formatReportText(result.report));

  if (!result.report.gate.pass) {
    const diffPath = `${outPath}.diff.json`;
    fs.writeFileSync(diffPath, toJson(result.report));
    console.error(`гейт провален; diff: ${diffPath}`);
    process.exit(allowGateFail ? 0 : 2);
  }
  fs.writeFileSync(outPath, result.output!);
  console.log(`записано: ${outPath} (${result.output!.length} байт)`);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
