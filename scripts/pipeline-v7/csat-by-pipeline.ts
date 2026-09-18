// CSAT by pipeline version — compares v7 vs v6 job outcomes and ratings (w38/26-v7-full-traffic).
// PRIVACY: never prints document content or names — only counts, ids, ratings, and comment text (truncated).

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const argv = process.argv.slice(2);
const flag = (name: string, def: string | undefined) => {
  const m = argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : def;
};
const SINCE = flag("since", "2026-09-12")!;
const UNTIL = flag("until", undefined);
interface V7Telemetry {
  gatePass: boolean;
  classification?: { suspect: boolean };
  formatMs: number;
  finalScoreUndef: number;
  auxTocInserted?: boolean;
  auxHeadings?: number;
  auxTocSkipped?: string;
  auxTitleBreakSkipped?: string;
}
interface JobRow {
  id: string;
  created_at: string;
  status: string;
  requirements_mode: string | null;
  statistics: { pipelineVersion?: "v6" | "v7"; v7Fallback?: string; v7?: V7Telemetry } | null;
  has_full_version: boolean | null;
}
interface FeedbackRow {
  job_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}
const pipelineOf = (row: JobRow): string => row.statistics?.pipelineVersion ?? "missing";
const bucketStatus = (s: string): string => (s === "completed" || s === "failed" ? s : "other");
const percentile = (nums: number[], p: number): number | null => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  if (p === 0.5) {
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const share = (flags: boolean[]): string =>
  flags.length === 0 ? "n/a" : `${((flags.filter(Boolean).length / flags.length) * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const sinceIso = new Date(`${SINCE}T00:00:00Z`).toISOString();
  const untilIso = UNTIL ? new Date(`${UNTIL}T00:00:00Z`).toISOString() : undefined;
  const baselineSinceIso = new Date(new Date(sinceIso).getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  let jobsQuery = supabase
    .from("jobs")
    .select("id, created_at, status, requirements_mode, statistics, has_full_version")
    .gte("created_at", sinceIso);
  if (untilIso) jobsQuery = jobsQuery.lt("created_at", untilIso);
  const { data: jobsData, error: jobsErr } = await jobsQuery;
  if (jobsErr) {
    console.error(jobsErr.message);
    process.exit(1);
  }
  const jobs = jobsData as unknown as JobRow[];
  console.log(`Jobs since ${SINCE}${UNTIL ? ` until ${UNTIL}` : ""}: ${jobs.length}`);
  console.log("\n=== 1. Jobs by pipelineVersion x status (requirements_mode=gost) ===");
  const gostJobs = jobs.filter((j) => j.requirements_mode === "gost");
  const uploadJobs = jobs.filter((j) => j.requirements_mode === "upload");
  const counts = new Map<string, number>();
  for (const j of gostJobs) {
    const key = `${pipelineOf(j)} x ${bucketStatus(j.status)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of [...counts.entries()].sort()) console.log(`  ${key}: ${n}`);
  console.log(`  (upload-mode total, all versions/statuses): ${uploadJobs.length}`);
  console.log("\n=== 2. v7 fallback reasons ===");
  const fallbackCounts = new Map<string, number>();
  for (const j of jobs) {
    const reason = j.statistics?.v7Fallback;
    if (!reason) continue;
    fallbackCounts.set(reason, (fallbackCounts.get(reason) ?? 0) + 1);
  }
  if (fallbackCounts.size === 0) console.log("  (none)");
  for (const [reason, n] of [...fallbackCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${reason}: ${n}`);
  console.log("\n=== 3. Ratings by pipelineVersion ===");
  const { data: fbData, error: fbErr } = await supabase
    .from("feedback")
    .select("job_id, rating, comment, created_at")
    .gte("created_at", baselineSinceIso);
  if (fbErr) {
    console.error(fbErr.message);
    process.exit(1);
  }
  const feedback = fbData as unknown as FeedbackRow[];
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const sinceFeedback = feedback.filter((f) => f.created_at >= sinceIso && (!untilIso || f.created_at < untilIso));
  const baselineFeedback = feedback.filter((f) => f.created_at >= baselineSinceIso && f.created_at < sinceIso);

  const summarize = (rows: FeedbackRow[], versionOf: (jobId: string) => string): void => {
    const byVersion = new Map<string, number[]>();
    for (const f of rows) {
      const v = versionOf(f.job_id);
      byVersion.set(v, [...(byVersion.get(v) ?? []), f.rating]);
    }
    for (const [v, ratings] of [...byVersion.entries()].sort()) {
      const n = ratings.length;
      const avg = ratings.reduce((a, b) => a + b, 0) / n;
      const low = ratings.filter((r) => r <= 2).length / n;
      const high = ratings.filter((r) => r === 5).length / n;
      console.log(`  ${v}: n=${n}, avg=${avg.toFixed(2)}, <=2★=${(low * 100).toFixed(1)}%, 5★=${(high * 100).toFixed(1)}%`);
    }
    if (byVersion.size === 0) console.log("  (no feedback in range)");
  };
  console.log(`  since ${SINCE}${UNTIL ? ` until ${UNTIL}` : ""}:`);
  summarize(sinceFeedback, (jobId) => (jobById.has(jobId) ? pipelineOf(jobById.get(jobId)!) : "unknown-job"));
  console.log(`  baseline (14d before ${SINCE}, all-version, treated as v6):`);
  summarize(baselineFeedback, () => "v6");

  console.log("\n=== 4. v7 telemetry (from statistics.v7) ===");
  const v7Jobs = jobs.filter((j) => j.statistics?.v7);
  const gatePassFlags = v7Jobs.map((j) => !!j.statistics!.v7!.gatePass);
  const suspectFlags = v7Jobs.map((j) => !!j.statistics!.v7!.classification?.suspect);
  const formatMsList = v7Jobs.map((j) => j.statistics!.v7!.formatMs).filter((n) => typeof n === "number");
  const finalScoreUndefList = v7Jobs.map((j) => j.statistics!.v7!.finalScoreUndef).filter((n) => typeof n === "number");
  console.log(`  n=${v7Jobs.length}`);
  console.log(`  gatePass share: ${share(gatePassFlags)}`);
  console.log(`  classification.suspect share: ${share(suspectFlags)}`);
  console.log(`  formatMs p50=${percentile(formatMsList, 0.5) ?? "n/a"} p95=${percentile(formatMsList, 0.95) ?? "n/a"}`);
  console.log(`  finalScoreUndef p50=${percentile(finalScoreUndefList, 0.5) ?? "n/a"}`);
  const tocInsertedFlags = v7Jobs.map((j) => !!j.statistics!.v7!.auxTocInserted);
  console.log(`  aux TOC inserted share: ${share(tocInsertedFlags)}`);
  const tally = (pick: (t: V7Telemetry) => string | undefined, label: string): void => {
    const counts = new Map<string, number>();
    for (const j of v7Jobs) {
      const reason = pick(j.statistics!.v7!);
      if (!reason) continue;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    console.log(`  ${label}:`);
    if (counts.size === 0) console.log("    (none)");
    for (const [reason, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${reason}: ${n}`);
  };
  tally((t) => t.auxTocSkipped, "aux TOC skipped by reason");
  tally((t) => t.auxTitleBreakSkipped, "aux title break skipped by reason");
  const headingsList = v7Jobs.map((j) => j.statistics!.v7!.auxHeadings).filter((n): n is number => typeof n === "number");
  console.log(`  aux headings p50=${percentile(headingsList, 0.5) ?? "n/a"}`);

  console.log("\n=== 5. Comments for ratings <=2 (since since-date) ===");
  const lowSince = sinceFeedback.filter((f) => f.rating <= 2);
  if (lowSince.length === 0) console.log("  (none)");
  for (const f of lowSince) {
    const j = jobById.get(f.job_id);
    const version = j ? pipelineOf(j) : "unknown-job";
    const fallback = j?.statistics?.v7Fallback ?? "-";
    const commentPreview = (f.comment ?? "").slice(0, 100);
    console.log(`  rating=${f.rating} pipelineVersion=${version} v7Fallback=${fallback} comment="${commentPreview}"`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
