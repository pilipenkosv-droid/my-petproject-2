// Печатает результат детерминированного слоя T0 по одному .docx: гистограмму
// ролей, гистограмму источников правил, флаг suspect, предупреждения и число
// кандидатов для последующего LLM-слоя.
//   npx tsx scripts/pipeline-v7/classify-report.ts <doc.docx> [--show-text]
// --show-text печатает роль и первые 60 символов каждого абзаца — никогда не
// применять к реальному корпусу студенческих работ.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import { candidatesForLlm } from "@/lib/pipeline-v7/classify/llm-candidates";
import type { ClassifiedParagraph } from "@/lib/pipeline-v7/classify/types";

function table(counts: Map<string, number>, total: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `  ${key.padEnd(18)} ${String(n).padStart(5)}  ${((n / total) * 100).toFixed(1)}%`);
}

function countBy(list: ClassifiedParagraph[], pick: (cp: ClassifiedParagraph) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cp of list) counts.set(pick(cp), (counts.get(pick(cp)) ?? 0) + 1);
  return counts;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const showText = args.includes("--show-text");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: classify-report.ts <doc.docx> [--show-text]");
    process.exit(1);
  }
  const pkg = await DocxPackage.load(readFileSync(file));
  const started = Date.now();
  const result = await classifyDocument(pkg);
  const elapsed = Date.now() - started;
  const total = result.list.length;

  console.log(`\n${basename(file)} — ${total} абзацев, ${elapsed} мс`);
  console.log(`suspect: ${result.suspect}`);
  console.log("роли:");
  console.log(table(countBy(result.list, (cp) => cp.role), total).join("\n"));
  console.log("источники:");
  console.log(table(countBy(result.list, (cp) => cp.source), total).join("\n"));
  console.log(`кандидаты для LLM-слоя: ${candidatesForLlm(result).length}`);
  console.log(`modal body size (half-points): ${result.modalBodySize ?? "—"}`);
  if (result.warnings.length > 0) {
    console.log(`предупреждения (${result.warnings.length}):`);
    for (const w of result.warnings.slice(0, 20)) console.log(`  ${w}`);
  }
  if (showText) {
    for (const cp of result.list) {
      console.log(`  ${cp.role.padEnd(18)} ${(cp.text ?? "").slice(0, 60)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
