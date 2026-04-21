// Extend golden dataset with 4 additional docs of varied complexity.
// Targets: (a) formula-rich, (b) large (≥30 pages), (c) simple structure,
// (d) figure-heavy. Excludes jobs already present in manifest.json.

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MANIFEST_PATH = "data/golden/manifest.json";
const RAW_DIR = "data/golden/raw";

interface Complexity {
  tables: number;
  figures: number;
  formulas: number;
  structure_confidence: number;
  heading_count: number;
  paragraph_count: number;
  file_size_kb: number;
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

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const existingSrc = new Set<string>(
    manifest.documents.map((d: { source_document_id: string | null }) => d.source_document_id).filter(Boolean),
  );
  const existingJobs = new Set<string>(manifest.documents.map((d: { id: string }) => d.id));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Pull recent completed jobs with a source_document_id, excluding existing.
  const { data, error } = await supabase
    .from("jobs")
    .select("id, source_document_id, work_type, created_at")
    .eq("status", "completed")
    .not("source_document_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  type Row = { id: string; source_document_id: string; work_type: string | null };
  const candidates = (data as Row[]).filter(
    (r) => !existingJobs.has(r.id) && !existingSrc.has(r.source_document_id),
  );
  console.log(`Scanning ${candidates.length} candidate jobs for varied complexity`);

  fs.mkdirSync(RAW_DIR, { recursive: true });

  const added: typeof manifest.documents = [];
  const buckets = {
    formulaRich: false, // >=5 formulas
    largeDoc: false,    // >=800 paragraphs
    simpleStructure: false, // h1 >= 3
    figureHeavy: false, // >=20 figures
  };

  for (const r of candidates) {
    if (Object.values(buckets).every(Boolean)) break;
    if (added.length >= 4) break;

    let buf: Buffer | null = null;
    for (const ext of [".docx", ".pdf", ".txt", ""]) {
      const { data: file } = await supabase.storage
        .from("documents")
        .download(`${r.source_document_id}${ext}`);
      if (file) {
        buf = Buffer.from(await file.arrayBuffer());
        break;
      }
    }
    if (!buf) continue;

    let c: Complexity;
    try {
      c = await detectComplexity(buf);
    } catch {
      continue;
    }

    let tag: keyof typeof buckets | null = null;
    if (!buckets.formulaRich && c.formulas >= 5) tag = "formulaRich";
    else if (!buckets.largeDoc && c.paragraph_count >= 800 && c.tables < 5) tag = "largeDoc";
    else if (!buckets.simpleStructure && c.structure_confidence >= 1.0) tag = "simpleStructure";
    else if (!buckets.figureHeavy && c.figures >= 20) tag = "figureHeavy";
    if (!tag) continue;
    buckets[tag] = true;

    const rawPath = path.join(RAW_DIR, `${r.id}.docx`);
    fs.writeFileSync(rawPath, buf);
    added.push({
      id: r.id,
      source_document_id: r.source_document_id,
      work_type: r.work_type,
      raw_path: rawPath,
      ideal_path: null,
      complexity: c,
      download_status: "ok",
      notes: `added for bucket:${tag}`,
    });
    console.log(
      `  + ${r.id} [${tag}] tables=${c.tables} fig=${c.figures} formulas=${c.formulas} paras=${c.paragraph_count} sc=${c.structure_confidence}`,
    );
  }

  console.log(`\nAdded ${added.length} docs. Buckets: ${JSON.stringify(buckets)}`);

  manifest.documents.push(...added);
  manifest.generated_at = new Date().toISOString();
  manifest.summary.total = manifest.documents.length;
  const ok = manifest.documents.filter((d: { download_status: string }) => d.download_status === "ok");
  manifest.summary.downloaded = ok.length;
  manifest.summary.with_formulas = ok.filter((d: { complexity: Complexity | null }) => (d.complexity?.formulas ?? 0) > 0).length;
  manifest.summary.with_figures = ok.filter((d: { complexity: Complexity | null }) => (d.complexity?.figures ?? 0) > 0).length;
  manifest.summary.with_merged_tables = ok.filter((d: { complexity: Complexity | null }) => (d.complexity?.tables ?? 0) >= 5).length;
  manifest.summary.low_structure = ok.filter((d: { complexity: Complexity | null }) => (d.complexity?.structure_confidence ?? 0) < 0.7).length;

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Manifest updated: ${manifest.summary.downloaded} total ok docs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
