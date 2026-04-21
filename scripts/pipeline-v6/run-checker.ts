// Run pipeline-v6 checker against a folder of .docx files or a golden manifest.
// Writes aggregate baseline report to bench-reports/v6/baseline-<date>.json.
//
// Usage:
//   npx tsx scripts/pipeline-v6/run-checker.ts data/golden/manifest.json
//   npx tsx scripts/pipeline-v6/run-checker.ts data/golden/raw/
//   npx tsx scripts/pipeline-v6/run-checker.ts single.docx

import * as fs from "fs";
import * as path from "path";

import { runQualityChecks, QualityReport } from "../../src/lib/pipeline-v6/checker";
import { DEFAULT_GOST_RULES } from "../../src/types/formatting-rules";

interface ManifestDoc {
  id: string;
  raw_path: string;
  ideal_path?: string;
}

interface Manifest {
  documents: ManifestDoc[];
}

async function collectInputs(target: string): Promise<{ id: string; raw: string; ideal?: string }[]> {
  const stat = fs.statSync(target);

  if (stat.isFile() && target.endsWith(".json")) {
    const manifest = JSON.parse(fs.readFileSync(target, "utf8")) as Manifest;
    return manifest.documents.map((d) => ({ id: d.id, raw: d.raw_path, ideal: d.ideal_path }));
  }

  if (stat.isFile() && target.endsWith(".docx")) {
    return [{ id: path.basename(target, ".docx"), raw: target }];
  }

  if (stat.isDirectory()) {
    return fs
      .readdirSync(target)
      .filter((f) => f.endsWith(".docx"))
      .map((f) => ({ id: path.basename(f, ".docx"), raw: path.join(target, f) }));
  }

  throw new Error(`Unsupported input: ${target}`);
}

async function checkOne(
  id: string,
  rawPath: string,
  formattedPath: string,
): Promise<QualityReport | null> {
  if (!fs.existsSync(rawPath)) {
    console.warn(`  skip ${id}: raw file missing at ${rawPath}`);
    return null;
  }
  if (!fs.existsSync(formattedPath)) {
    console.warn(`  skip ${id}: formatted file missing at ${formattedPath}`);
    return null;
  }
  const raw = fs.readFileSync(rawPath);
  const formatted = fs.readFileSync(formattedPath);
  const rules = {
    margins: DEFAULT_GOST_RULES.document.margins,
    fontFamily: DEFAULT_GOST_RULES.text.fontFamily,
    fontSize: DEFAULT_GOST_RULES.text.fontSize,
    lineSpacing: DEFAULT_GOST_RULES.text.lineSpacing,
    paragraphIndent: DEFAULT_GOST_RULES.text.paragraphIndent,
  };
  return runQualityChecks(raw, formatted, undefined, id, rules);
}

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: run-checker <manifest.json | folder | file.docx>");
    process.exit(1);
  }

  const inputs = await collectInputs(target);
  console.log(`Running v6 checker on ${inputs.length} docs (target: ${target})`);

  const reports: QualityReport[] = [];
  for (const input of inputs) {
    const formattedPath = input.ideal ?? input.raw;
    const report = await checkOne(input.id, input.raw, formattedPath);
    if (!report) continue;
    reports.push(report);
    const failedCritical = report.checks.filter((c) => !c.passed && c.severity === "critical").length;
    const failedMajor = report.checks.filter((c) => !c.passed && c.severity === "major").length;
    console.log(
      `  ${input.id}: score=${report.score}  crit_fail=${failedCritical}  major_fail=${failedMajor}`,
    );
  }

  const failedByRule = new Map<string, { name: string; severity: string; docs: number }>();
  for (const r of reports) {
    for (const c of r.checks) {
      if (c.passed) continue;
      const prev = failedByRule.get(c.id) ?? { name: c.name, severity: c.severity, docs: 0 };
      prev.docs += 1;
      failedByRule.set(c.id, prev);
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    target,
    total: reports.length,
    avg_score: reports.length
      ? Math.round(reports.reduce((s, r) => s + r.score, 0) / reports.length)
      : 0,
    top_failed_checks: [...failedByRule.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.docs - a.docs)
      .slice(0, 15),
    reports: reports.map((r) => ({
      id: r.documentId,
      score: r.score,
      categories: r.categories,
      failed: r.checks.filter((c) => !c.passed).map((c) => ({ id: c.id, severity: c.severity })),
    })),
  };

  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.join("bench-reports", "v6");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `baseline-${date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nBaseline report: ${outPath}`);
  console.log(`Docs: ${summary.total}  Avg score: ${summary.avg_score}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
