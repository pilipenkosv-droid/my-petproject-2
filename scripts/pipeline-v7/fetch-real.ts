// Fetch a real-document corpus from Supabase for the formatting-pipeline v7 bench.
// One-shot: bucket `documents` has a 48h TTL, so recent jobs are the only source.
// PRIVACY: never logs document text or original file names — only ids/counts/hashes.

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OUT_DIR = "data/corpus/real";
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

const argv = process.argv.slice(2);
const flag = (name: string, def: number) => {
  const m = argv.find((a) => a.startsWith(`--${name}=`));
  return m ? Number(m.split("=")[1]) : def;
};
const LIMIT = flag("limit", 25);
const DAYS = flag("days", 3);
const DRY_RUN = argv.includes("--dry-run");

interface Features {
  tables: number;
  mergedCells: number;
  nestedTables: number;
  footnotes: boolean;
  sections: number;
  refFields: number;
  omath: number;
  images: number;
  numPr: number;
  paragraphs: number;
  bytes: number;
  producer: string | null;
}

async function detectFeatures(buf: Buffer): Promise<Features | null> {
  if (buf.length < 4 || buf.toString("utf8", 0, 2) !== "PK") return null;
  const zip = await JSZip.loadAsync(buf);
  if (!zip.file("word/document.xml")) return null;
  const xml = (await zip.file("word/document.xml")!.async("string")) ?? "";

  const footnotesXml = (await zip.file("word/footnotes.xml")?.async("string")) ?? "";
  const hasFootnotes = /<w:footnote\s+[^>]*w:id="(?!-?[01]")[0-9]+/.test(footnotesXml);

  const appXml = (await zip.file("docProps/app.xml")?.async("string")) ?? "";
  const producerMatch = appXml.match(/<Application>([^<]*)<\/Application>/);

  const nestedTableMatches = xml.match(/<w:tc[ >][\s\S]*?<w:tbl[ >]/g) ?? [];

  return {
    tables: (xml.match(/<w:tbl[ >]/g) ?? []).length,
    mergedCells: (xml.match(/<w:vMerge|<w:gridSpan/g) ?? []).length,
    nestedTables: nestedTableMatches.length,
    footnotes: hasFootnotes,
    sections: (xml.match(/<w:sectPr/g) ?? []).length,
    refFields: (xml.match(/<w:instrText[^>]*>[^<]*\b(REF|PAGEREF|SEQ|NOTEREF)\b/g) ?? []).length,
    omath: (xml.match(/<m:oMath[ >]/g) ?? []).length,
    images: (xml.match(/<w:drawing>|<w:pict>/g) ?? []).length,
    numPr: (xml.match(/<w:numPr>/g) ?? []).length,
    paragraphs: (xml.match(/<w:p[ >]/g) ?? []).length,
    bytes: buf.byteLength,
    producer: producerMatch ? producerMatch[1] : null,
  };
}

interface JobRow {
  id: string;
  created_at: string;
  status: string;
  requirements_mode: string | null;
  source_document_id: string | null;
  source_original_name: string | null;
  statistics: { tableCount?: number; imageCount?: number; paragraphCount?: number; originalPageCount?: number } | null;
  error: string | null;
  status_message: string | null;
}

interface Doc {
  id: string;
  file: string;
  features: Features;
  requirementsMode: string | null;
  jobStatus: string;
  jobError: string | null;
  original_name_hash: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function downloadDoc(supabase: any, sourceId: string): Promise<Buffer | null> {
  for (const ext of [".docx", ".pdf", ".txt", ""]) {
    const { data: file } = await supabase.storage.from("documents").download(`${sourceId}${ext}`);
    if (file) return Buffer.from(await file.arrayBuffer());
  }
  return null;
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, created_at, status, requirements_mode, source_document_id, source_original_name, statistics, error, status_message",
    )
    .gte("created_at", since)
    .not("source_document_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = data as unknown as JobRow[];
  console.log(`Found ${rows.length} jobs with source_document_id in last ${DAYS}d`);

  const skipped = { no_source: 0, download_failed: 0, non_docx: 0, corrupt: 0 };
  type Candidate = { row: JobRow; buf: Buffer; features: Features };
  const candidates: Candidate[] = [];

  for (const row of rows) {
    if (!row.source_document_id) {
      skipped.no_source++;
      continue;
    }
    const buf = await downloadDoc(supabase, row.source_document_id);
    if (!buf) {
      skipped.download_failed++;
      continue;
    }
    let features: Features | null;
    try {
      features = await detectFeatures(buf);
    } catch {
      features = null;
    }
    if (!features) {
      // Not a parseable docx — either a real pdf/txt upload, or a corrupt zip.
      if (buf.toString("utf8", 0, 2) === "PK") skipped.corrupt++;
      else skipped.non_docx++;
      continue;
    }
    candidates.push({ row, buf, features });
  }

  console.log(`Real .docx candidates: ${candidates.length}`);

  // Stratified selection.
  const selected: Candidate[] = [];
  const used = new Set<string>();
  const take = (pred: (c: Candidate) => boolean, cap: number) => {
    let n = 0;
    for (const c of candidates) {
      if (n >= cap || selected.length >= LIMIT) break;
      if (used.has(c.row.id) || !pred(c)) continue;
      selected.push(c);
      used.add(c.row.id);
      n++;
    }
  };

  take((c) => c.row.status === "failed", 6); // priority: ≥5 timeout-bench candidates
  take((c) => c.features.mergedCells > 0, 4);
  take((c) => c.features.footnotes, 4);
  take((c) => c.features.sections > 1, 3);
  take((c) => c.features.refFields > 0, 3);
  take((c) => c.features.omath > 0, 3);
  take((c) => c.features.nestedTables > 0, 3);
  take((c) => !!c.features.producer && !/microsoft/i.test(c.features.producer), 3);
  // Fill remainder randomly.
  const remaining = candidates.filter((c) => !used.has(c.row.id));
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  for (const c of remaining) {
    if (selected.length >= LIMIT) break;
    selected.push(c);
    used.add(c.row.id);
  }

  const failedCount = selected.filter((c) => c.row.status === "failed").length;
  console.log(`Selected ${selected.length} docs (failed-status: ${failedCount})`);

  if (DRY_RUN) {
    console.log("Dry run — not writing files.");
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const docs: Doc[] = [];
  for (const c of selected) {
    const file = `${c.row.id}.docx`;
    fs.writeFileSync(path.join(OUT_DIR, file), c.buf);
    const nameHash = crypto
      .createHash("sha1")
      .update(c.row.source_original_name ?? "")
      .digest("hex");
    docs.push({
      id: c.row.id,
      file,
      features: c.features,
      requirementsMode: c.row.requirements_mode,
      jobStatus: c.row.status,
      jobError: (c.row.status_message || c.row.error || "").slice(0, 80),
      original_name_hash: nameHash,
    });
  }

  const manifest = {
    fetched_at: new Date().toISOString(),
    ttl_note: "source files expire 48h after upload",
    docs,
    skipped,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${docs.length} docs + manifest to ${OUT_DIR}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
