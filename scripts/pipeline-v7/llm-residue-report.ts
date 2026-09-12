// Прогоняет LLM-слой T1 поверх T0 по одному .docx и печатает, что изменилось:
// число запросов, время, назначено/пропущено, гистограмму до → после.
//   npx tsx scripts/pipeline-v7/llm-residue-report.ts <doc.docx> [--show-text]
// Бюджеты переопределяются env: LLM_REQUEST_TIMEOUT_MS, LLM_TOTAL_BUDGET_MS, LLM_MAX_REQUESTS.
// --show-text печатает изменённые строки — только для синтетического корпуса.
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import { classifyResidueWithLlm } from "@/lib/pipeline-v7/classify/llm";
import { mergeLlmRoles } from "@/lib/pipeline-v7/classify/merge";
import { ROLES, type Role } from "@/lib/pipeline-v7/classify/types";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const showText = args.includes("--show-text");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: llm-residue-report.ts <doc.docx> [--show-text]");
    process.exit(1);
  }
  const pkg = await DocxPackage.load(readFileSync(file));
  const t0 = await classifyDocument(pkg);
  const before = { ...t0.histogram };
  const wasCandidate = new Map(
    t0.list.map((cp) => [cp.path, cp.role] as const),
  );

  const num = (name: string) => {
    const v = process.env[name];
    return v ? Number(v) : undefined;
  };
  const residue = await classifyResidueWithLlm(t0, {
    perRequestTimeoutMs: num("LLM_REQUEST_TIMEOUT_MS"),
    totalBudgetMs: num("LLM_TOTAL_BUDGET_MS"),
    maxRequests: num("LLM_MAX_REQUESTS"),
  });
  const merged = mergeLlmRoles(t0, residue);

  console.log(`\n${basename(file)} — ${t0.list.length} абзацев`);
  console.log(
    `кандидаты ${merged.llm.candidates}, запросов ${merged.llm.requests}, ` +
      `назначено ${merged.llm.assigned}, пропущено ${merged.llm.skipped}, ` +
      `degraded ${merged.llm.degraded}, ${merged.llm.ms} мс`,
  );
  if (residue.errors.length > 0) console.log(`ошибки: ${residue.errors.slice(0, 3).join(" | ")}`);
  console.log(`низкая уверенность: ${merged.lowConfidence.length}`);
  console.log("роль                 до    после   Δ");
  for (const role of ROLES) {
    const b = before[role as Role];
    const a = merged.histogram[role as Role];
    if (b === 0 && a === 0) continue;
    const d = a - b;
    console.log(`  ${role.padEnd(18)} ${String(b).padStart(5)} ${String(a).padStart(7)} ${d > 0 ? "+" : ""}${d}`);
  }
  if (showText) {
    for (const cp of merged.list) {
      if (cp.source !== "llm") continue;
      console.log(`  ${wasCandidate.get(cp.path)} → ${cp.role.padEnd(18)} ${(cp.text ?? "").slice(0, 70)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
