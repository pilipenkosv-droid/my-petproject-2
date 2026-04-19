/**
 * Replay rating=1 jobs через текущий pipeline форматирования.
 *
 * Цель: измерить, сколько из детектированных violations пайплайн реально чинит
 * на корпусе 1★-кейсов, и локализовать топ системных дефектов.
 *
 * Запуск:
 *   npx tsx scripts/bench-1star-replay.ts --days 30 --out bench-reports/1star-2026-04-19.json
 *   npx tsx scripts/bench-1star-replay.ts --limit 3            # только 3 топовых кейса
 *   npx tsx scripts/bench-1star-replay.ts --jobs id1,id2,id3   # конкретные job ids
 */

import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { parseDocxStructure, enrichWithBlockMarkup, analyzeDocument } from "../src/lib/pipeline/document-analyzer";
import { formatDocument } from "../src/lib/pipeline/document-formatter";
import { mergeWithDefaults } from "../src/lib/ai/provider";
import { recordUsage } from "../src/lib/ai/rate-limiter";
import { runQualityChecks } from "./quality-checks";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface Args {
  days: number;
  limit?: number;
  jobIds?: string[];
  outPath: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { days: 30, outPath: "" };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--days") args.days = parseInt(argv[++i], 10);
    else if (v === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (v === "--jobs") args.jobIds = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (v === "--out") args.outPath = argv[++i];
  }
  if (!args.outPath) {
    const date = new Date().toISOString().slice(0, 10);
    args.outPath = `bench-reports/1star-${date}.json`;
  }
  return args;
}

interface JobRow {
  job_id: string;
  rating: number;
  comment: string | null;
  source_document_id: string;
  work_type: string | null;
  tables: number;
  original_violations: number;
  original_table_viol: number;
  original_margin_viol: number;
  original_heading_viol: number;
}

async function fetchJobs(days: number, limit?: number, jobIds?: string[]): Promise<JobRow[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  let fbQuery = supabase
    .from("feedback")
    .select("job_id, rating, comment, created_at")
    .eq("rating", 1)
    .gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("created_at", { ascending: false });
  if (jobIds?.length) fbQuery = fbQuery.in("job_id", jobIds);

  const { data: feedback, error: fbErr } = await fbQuery;
  if (fbErr) throw new Error(`Supabase feedback error: ${fbErr.message}`);
  if (!feedback?.length) return [];

  const ids = [...new Set(feedback.map((f) => f.job_id).filter((id): id is string => !!id && id !== "test_verify_deploy"))];
  const { data: jobs, error: jErr } = await supabase
    .from("jobs")
    .select("id, source_document_id, work_type, status, violations, statistics")
    .in("id", ids);
  if (jErr) throw new Error(`Supabase jobs error: ${jErr.message}`);

  type JobLite = {
    id: string;
    source_document_id: string | null;
    work_type: string | null;
    status: string;
    violations: Array<{ ruleId?: string }> | null;
    statistics: { tableCount?: number } | null;
  };
  const byId = new Map<string, JobLite>(((jobs as JobLite[]) ?? []).map((j) => [j.id, j]));

  const rows: JobRow[] = [];
  for (const f of feedback) {
    if (!f.job_id) continue;
    const j = byId.get(f.job_id);
    if (!j || !j.source_document_id || j.status !== "completed") continue;
    const viol = j.violations ?? [];
    rows.push({
      job_id: f.job_id,
      rating: f.rating,
      comment: f.comment ?? null,
      source_document_id: j.source_document_id,
      work_type: j.work_type,
      tables: j.statistics?.tableCount ?? 0,
      original_violations: viol.length,
      original_table_viol: viol.filter((v) => v.ruleId?.startsWith("table-")).length,
      original_margin_viol: viol.filter((v) => v.ruleId?.startsWith("margins-")).length,
      original_heading_viol: viol.filter((v) => v.ruleId?.startsWith("heading")).length,
    });
  }
  rows.sort((a, b) => b.original_table_viol - a.original_table_viol);
  return limit ? rows.slice(0, limit) : rows;
}

async function downloadDocument(fileId: string): Promise<Buffer> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  for (const ext of [".docx", ".pdf", ".txt", ""]) {
    const { data, error } = await supabase.storage.from("documents").download(`${fileId}${ext}`);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }
  throw new Error(`Document not found in Supabase: ${fileId}`);
}

interface ReplayResult {
  job_id: string;
  source_document_id: string;
  comment: string | null;
  work_type: string | null;
  tables_before: number;
  // original stored violations
  original: {
    total: number;
    table: number;
    margins: number;
    heading: number;
  };
  // replay metrics (fresh pipeline run)
  replay: {
    detected_violations: number;
    auto_fixable: number;
    fixes_applied: number;
    fix_ratio: number; // fixes_applied / auto_fixable
    quality_score: number;
    failed_checks: Array<{ id: string; name: string; severity: string; count?: number }>;
    block_types: Record<string, number>;
    timing_ms: number;
    model_id: string | null;
  };
  error?: string;
}

async function replayOne(row: JobRow): Promise<ReplayResult> {
  const base: ReplayResult = {
    job_id: row.job_id,
    source_document_id: row.source_document_id,
    comment: row.comment,
    work_type: row.work_type,
    tables_before: row.tables,
    original: {
      total: row.original_violations,
      table: row.original_table_viol,
      margins: row.original_margin_viol,
      heading: row.original_heading_viol,
    },
    replay: {
      detected_violations: 0,
      auto_fixable: 0,
      fixes_applied: 0,
      fix_ratio: 0,
      quality_score: 0,
      failed_checks: [],
      block_types: {},
      timing_ms: 0,
      model_id: null,
    },
  };

  const t0 = Date.now();
  try {
    console.log(`\n▶ ${row.job_id}  doc=${row.source_document_id}  tables=${row.tables}`);
    const buffer = await downloadDocument(row.source_document_id);
    const rules = mergeWithDefaults({});

    const docx = await parseDocxStructure(buffer);
    await recordUsage("aitunnel-gemini-flash-lite");
    const { paragraphs: enriched, modelId } = await enrichWithBlockMarkup(docx.paragraphs);

    const blockTypes: Record<string, number> = {};
    for (const p of enriched) {
      const bt = p.blockType || "unknown";
      blockTypes[bt] = (blockTypes[bt] || 0) + 1;
    }

    const analysis = await analyzeDocument(buffer, rules, enriched);
    const autoFixable = analysis.violations.filter((v) => v.autoFixable).length;

    await recordUsage("aitunnel-gemini-flash-lite");
    const formatted = await formatDocument(buffer, rules, analysis.violations, enriched, "admin");

    const report = await runQualityChecks(
      buffer,
      formatted.formattedDocument,
      enriched,
      row.source_document_id,
      {
        margins: rules.document.margins,
        fontFamily: rules.text.fontFamily,
        fontSize: rules.text.fontSize,
        lineSpacing: rules.text.lineSpacing,
        paragraphIndent: rules.text.paragraphIndent,
      },
    );

    base.replay = {
      detected_violations: analysis.violations.length,
      auto_fixable: autoFixable,
      fixes_applied: formatted.fixesApplied,
      fix_ratio: autoFixable > 0 ? formatted.fixesApplied / autoFixable : 0,
      quality_score: report.score,
      failed_checks: report.checks
        .filter((c) => !c.passed)
        .map((c) => ({ id: c.id, name: c.name, severity: c.severity, count: c.count })),
      block_types: blockTypes,
      timing_ms: Date.now() - t0,
      model_id: modelId ?? null,
    };

    console.log(
      `  score=${report.score}  viol=${analysis.violations.length}  fixes=${formatted.fixesApplied}/${autoFixable}  (${Date.now() - t0}ms)`,
    );
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    base.replay.timing_ms = Date.now() - t0;
    console.error(`  ✗ ${base.error}`);
  }
  return base;
}

function summarize(results: ReplayResult[]) {
  const ok = results.filter((r) => !r.error);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const failedAgg = new Map<string, { name: string; severity: string; docs: number }>();
  for (const r of ok) {
    for (const c of r.replay.failed_checks) {
      const e = failedAgg.get(c.id) ?? { name: c.name, severity: c.severity, docs: 0 };
      e.docs++;
      failedAgg.set(c.id, e);
    }
  }

  return {
    total_jobs: results.length,
    ok_count: ok.length,
    error_count: results.length - ok.length,
    avg_quality_score: Math.round(avg(ok.map((r) => r.replay.quality_score))),
    avg_fix_ratio: Number(avg(ok.map((r) => r.replay.fix_ratio)).toFixed(3)),
    avg_detected_viol: Math.round(avg(ok.map((r) => r.replay.detected_violations))),
    avg_fixes_applied: Math.round(avg(ok.map((r) => r.replay.fixes_applied))),
    total_unknown_block: ok.reduce((s, r) => s + (r.replay.block_types["unknown"] ?? 0), 0),
    top_failed_checks: [...failedAgg.entries()]
      .sort((a, b) => b[1].docs - a[1].docs)
      .slice(0, 15)
      .map(([id, d]) => ({ id, name: d.name, severity: d.severity, docs: d.docs })),
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const args = parseArgs();
  console.log(`bench-1star-replay: days=${args.days} limit=${args.limit ?? "all"} jobs=${args.jobIds?.join(",") ?? "from DB"}`);

  await recordUsage("aitunnel-gemini-flash-lite");

  const jobs = await fetchJobs(args.days, args.limit, args.jobIds);
  console.log(`Found ${jobs.length} rating=1 jobs to replay\n`);

  const results: ReplayResult[] = [];
  for (const j of jobs) {
    results.push(await replayOne(j));
  }

  const summary = summarize(results);
  const report = { generated_at: new Date().toISOString(), args, summary, results };

  const dir = args.outPath.split("/").slice(0, -1).join("/");
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(args.outPath, JSON.stringify(report, null, 2));

  console.log("\n═══ SUMMARY ═══");
  console.log(`  Replayed: ${summary.ok_count}/${summary.total_jobs}  (${summary.error_count} errors)`);
  console.log(`  Avg score: ${summary.avg_quality_score}/100`);
  console.log(`  Avg fix ratio: ${(summary.avg_fix_ratio * 100).toFixed(1)}%  (${summary.avg_fixes_applied}/${summary.avg_detected_viol} per doc avg)`);
  console.log(`  Total 'unknown' blockType: ${summary.total_unknown_block}`);
  console.log(`\n  Top failed checks (across docs):`);
  for (const c of summary.top_failed_checks.slice(0, 10)) {
    console.log(`    ${c.severity.padEnd(8)} ${c.id.padEnd(35)} ${c.docs} docs  — ${c.name}`);
  }
  console.log(`\n  Report → ${args.outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
