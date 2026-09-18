/**
 * Выгружает корпус методичек из Supabase в data/bench/guidelines/.
 * Тексты на экран НЕ печатаются — только статистика.
 *
 * Запуск: npx tsx scripts/guidelines/export-guidelines.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { DOCS_DIR, RULES_DIR, ROOT, ensureDirs, writeJson, quantile } from "./common";

interface JobRow {
  id: string;
  guidelines_text: string | null;
  rules: unknown | null;
  created_at: string;
}

export interface ManifestEntry {
  id: string;
  chars: number;
  jobIds: number;
  hasRules: boolean;
}

/** Нормализация пробелов: разные выгрузки одного файла должны дать один sha1. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

function docId(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);
}

async function fetchJobs(): Promise<JobRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key);

  const rows: JobRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from("jobs")
      .select("id, guidelines_text, rules, created_at")
      .eq("requirements_mode", "upload")
      .not("guidelines_text", "is", null)
      .gte("created_at", "2026-08-01")
      .order("created_at", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`Supabase: ${error.message}`);
    rows.push(...((data || []) as JobRow[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

function groupByText(rows: JobRow[]): Map<string, { text: string; jobIds: string[]; rules: unknown | null }> {
  const byId = new Map<string, { text: string; jobIds: string[]; rules: unknown | null }>();
  for (const row of rows) {
    const text = normalize(row.guidelines_text || "");
    if (text.length < 200) continue;
    const id = docId(text);
    const entry = byId.get(id) || { text, jobIds: [], rules: null };
    entry.jobIds.push(row.id);
    if (!entry.rules && row.rules) entry.rules = row.rules;
    byId.set(id, entry);
  }
  return byId;
}

async function main(): Promise<void> {
  ensureDirs();
  const rows = await fetchJobs();
  console.log(`Строк jobs (upload, с текстом, с 2026-08-01): ${rows.length}`);

  const byId = groupByText(rows);
  const manifest: ManifestEntry[] = [];

  for (const [id, entry] of byId) {
    fs.writeFileSync(path.join(DOCS_DIR, `${id}.txt`), entry.text);
    if (entry.rules) writeJson(path.join(RULES_DIR, `${id}.json`), entry.rules);
    manifest.push({
      id,
      chars: entry.text.length,
      jobIds: entry.jobIds.length,
      hasRules: Boolean(entry.rules),
    });
  }

  manifest.sort((a, b) => a.chars - b.chars);
  writeJson(path.join(ROOT, "manifest.json"), manifest);

  const lens = manifest.map((m) => m.chars).sort((a, b) => a - b);
  console.log(`Уникальных методичек: ${manifest.length}`);
  console.log(`С прод-правилами: ${manifest.filter((m) => m.hasRules).length}`);
  console.log(
    `Длина, символов: min ${lens[0]} / p50 ${Math.round(quantile(lens, 0.5))} / ` +
      `p90 ${Math.round(quantile(lens, 0.9))} / max ${lens[lens.length - 1]}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
