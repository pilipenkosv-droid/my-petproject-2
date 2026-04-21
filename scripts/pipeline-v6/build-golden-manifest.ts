// Build golden dataset manifest for pipeline-v6.
// Reads job IDs from bench-reports/1star/full-*.json, downloads raw docs from
// Supabase storage, detects complexity, writes data/golden/manifest.json.
//
// Only manifest.json is committed; .docx files are gitignored (PII).

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BENCH_REPORT = "bench-reports/1star/full-2026-04-19.json";
const OUT_DIR = "data/golden";
const RAW_DIR = path.join(OUT_DIR, "raw");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

interface BenchResult {
  job_id: string;
  source_document_id?: string;
  work_type?: string | null;
  tables_before?: number;
}

interface BenchReport {
  results: BenchResult[];
}

interface Complexity {
  tables: number;
  figures: number;
  formulas: number;
  structure_confidence: number;
  heading_count: number;
  paragraph_count: number;
  file_size_kb: number;
}

interface ManifestDoc {
  id: string;
  source_document_id: string | null;
  work_type: string | null;
  raw_path: string;
  ideal_path: string | null;
  complexity: Complexity | null;
  download_status: "ok" | "missing" | "error";
  error?: string;
  notes: string;
}

async function detectComplexity(buf: Buffer): Promise<Complexity> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const tables = (xml.match(/<w:tbl[ >]/g) ?? []).length;
  const figures = Object.keys(zip.files).filter(
    (f) => f.startsWith("word/media/") && /\.(png|jpg|jpeg|gif|bmp|emf|wmf)$/i.test(f),
  ).length;
  const formulas = (xml.match(/<m:oMath\b/g) ?? []).length;
  const paragraphs = (xml.match(/<w:p[ >]/g) ?? []).length;
  const h1 = (xml.match(/<w:pStyle w:val="Heading1"/g) ?? []).length;
  const h2 = (xml.match(/<w:pStyle w:val="Heading2"/g) ?? []).length;
  const headingCount = h1 + h2;
  const structureConfidence = h1 >= 3 ? 1.0 : headingCount >= 1 ? 0.5 : 0.3;
  return {
    tables,
    figures,
    formulas,
    structure_confidence: structureConfidence,
    heading_count: headingCount,
    paragraph_count: paragraphs,
    file_size_kb: Math.round(buf.byteLength / 1024),
  };
}

async function downloadRaw(sourceDocId: string): Promise<Buffer | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  for (const ext of [".docx", ".pdf", ".txt", ""]) {
    const { data, error } = await supabase.storage
      .from("documents")
      .download(`${sourceDocId}${ext}`);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }
  return null;
}

async function fetchJobMeta(
  jobIds: string[],
): Promise<Map<string, { source_document_id: string | null; work_type: string | null }>> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return new Map();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("jobs")
    .select("id, source_document_id, work_type")
    .in("id", jobIds);
  if (error) {
    console.warn(`Supabase jobs query failed: ${error.message}`);
    return new Map();
  }
  type Row = { id: string; source_document_id: string | null; work_type: string | null };
  return new Map(((data as Row[]) ?? []).map((r) => [r.id, r]));
}

async function main(): Promise<void> {
  if (!fs.existsSync(BENCH_REPORT)) {
    console.error(`Missing bench report: ${BENCH_REPORT}`);
    process.exit(1);
  }
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const bench = JSON.parse(fs.readFileSync(BENCH_REPORT, "utf8")) as BenchReport;
  const jobIds = [...new Set(bench.results.map((r) => r.job_id).filter(Boolean))];
  console.log(`Found ${jobIds.length} job IDs in ${BENCH_REPORT}`);

  const meta = await fetchJobMeta(jobIds);
  console.log(`Fetched metadata for ${meta.size}/${jobIds.length} jobs`);

  const docs: ManifestDoc[] = [];
  for (const jobId of jobIds) {
    const m = meta.get(jobId);
    const entry: ManifestDoc = {
      id: jobId,
      source_document_id: m?.source_document_id ?? null,
      work_type: m?.work_type ?? null,
      raw_path: path.join(RAW_DIR, `${jobId}.docx`),
      ideal_path: null,
      complexity: null,
      download_status: "missing",
      notes: "",
    };

    const sourceId = m?.source_document_id;
    if (!sourceId) {
      entry.error = "no source_document_id in jobs table";
      docs.push(entry);
      console.log(`  ${jobId}: SKIP (no source_document_id)`);
      continue;
    }

    try {
      const buf = await downloadRaw(sourceId);
      if (!buf) {
        entry.error = "document not found in storage";
        docs.push(entry);
        console.log(`  ${jobId}: MISSING (${sourceId})`);
        continue;
      }
      fs.writeFileSync(entry.raw_path, buf);
      entry.complexity = await detectComplexity(buf);
      entry.download_status = "ok";
      docs.push(entry);
      console.log(
        `  ${jobId}: OK tables=${entry.complexity.tables} fig=${entry.complexity.figures} formulas=${entry.complexity.formulas} sc=${entry.complexity.structure_confidence}`,
      );
    } catch (err) {
      entry.download_status = "error";
      entry.error = err instanceof Error ? err.message : String(err);
      docs.push(entry);
      console.log(`  ${jobId}: ERROR ${entry.error}`);
    }
  }

  const okDocs = docs.filter((d) => d.download_status === "ok");
  const summary = {
    total: docs.length,
    downloaded: okDocs.length,
    missing: docs.filter((d) => d.download_status === "missing").length,
    errors: docs.filter((d) => d.download_status === "error").length,
    with_formulas: okDocs.filter((d) => (d.complexity?.formulas ?? 0) > 0).length,
    with_figures: okDocs.filter((d) => (d.complexity?.figures ?? 0) > 0).length,
    with_merged_tables: okDocs.filter((d) => (d.complexity?.tables ?? 0) >= 5).length,
    low_structure: okDocs.filter((d) => (d.complexity?.structure_confidence ?? 0) < 0.7).length,
  };

  const manifest = {
    generated_at: new Date().toISOString(),
    source: BENCH_REPORT,
    summary,
    documents: docs,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${MANIFEST_PATH}`);
  console.log(JSON.stringify(summary, null, 2));

  if (okDocs.length < 16) {
    console.warn(
      `\n⚠ Downloaded only ${okDocs.length}/16 docs. Неделя 1 acceptance требует ≥16 + добрать 4 новых типа.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
