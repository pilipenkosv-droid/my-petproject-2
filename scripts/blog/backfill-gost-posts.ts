/**
 * One-shot backfill: posts-gost.ts + posts-pain-clusters.ts +
 * posts-seasonal-draft.ts → таблица blog_posts с cluster='gost'.
 *
 * Пишет в прод-базу. Запускает владелец, вручную:
 *   npx dotenv -e .env.local -- npx tsx scripts/blog/backfill-gost-posts.ts
 *   npx tsx scripts/blog/backfill-gost-posts.ts --dry-run   # только отчёт
 *
 * Нужны env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * После бэкфилла getAllPosts() берёт ГОСТ-кластер из БД (posts.ts), а статика
 * остаётся резервом на случай сбоя БД. Скрипт идемпотентен: upsert по slug.
 */

import { createClient } from "@supabase/supabase-js";
import { blogPostsGost } from "../../src/lib/blog/posts-gost";
import { blogPostsPainClusters } from "../../src/lib/blog/posts-pain-clusters";
import { seasonalDraftPosts } from "../../src/lib/blog/posts-seasonal-draft";
import type { BlogPost } from "../../src/lib/blog/types";

const CHUNK_SIZE = 50;

export function collectGostPosts(): BlogPost[] {
  const all = [...blogPostsGost, ...seasonalDraftPosts, ...blogPostsPainClusters];
  const bySlug = new Map<string, BlogPost>();
  for (const p of all) bySlug.set(p.slug, p);
  return [...bySlug.values()];
}

export function toRow(p: BlogPost) {
  return {
    slug: p.slug,
    title: p.title,
    description: p.description,
    content: p.content,
    date_published: p.datePublished,
    date_modified: p.dateModified ?? null,
    keywords: p.keywords,
    reading_time: p.readingTime,
    cover_image: p.coverImage ?? null,
    faqs: p.faqs ?? null,
    tldr: p.tldr ?? null,
    cluster: "gost" as const,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const posts = collectGostPosts();
  const rows = posts.map(toRow);
  console.log(`GOST posts to upsert: ${rows.length}`);

  if (dryRun) {
    console.log(rows.slice(0, 5).map((r) => `  ${r.slug} — ${r.title}`).join("\n"));
    console.log("dry-run: ничего не записано");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("blog_posts").upsert(chunk, { onConflict: "slug" });
    if (error) {
      console.error(`[chunk ${i}] error:`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    console.log(`  upserted ${done}/${rows.length}`);
  }

  const { count, error } = await supabase
    .from("blog_posts")
    .select("*", { count: "exact", head: true })
    .eq("cluster", "gost");
  if (error) {
    console.error("count error:", error.message);
    process.exit(1);
  }
  console.log(`Done. blog_posts rows with cluster='gost': ${count}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
