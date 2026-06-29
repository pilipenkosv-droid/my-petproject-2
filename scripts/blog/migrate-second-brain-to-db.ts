/**
 * One-shot seed: переносит posts-second-brain.ts → таблицу blog_posts.
 *
 * Использование:
 *   npx tsx scripts/blog/migrate-second-brain-to-db.ts
 *
 * Перед запуском нужны env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (читаются автоматически через .env.local при запуске через next-aware tsx, либо
 * передавать через `dotenv -e .env.local --`).
 *
 * После завершения: `select count(*) from blog_posts` должно совпасть с длиной
 * blogPostsSecondBrain. После этого посты можно публиковать через /api/blog/publish.
 */

import { createClient } from "@supabase/supabase-js";
import { blogPostsSecondBrain } from "../../src/lib/blog/posts-second-brain";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Seeding ${blogPostsSecondBrain.length} Second Brain posts...`);

  const rows = blogPostsSecondBrain.map((p) => ({
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
    cluster: "second-brain" as const,
  }));

  // Чанки по 50, чтобы не упереться в лимит размера запроса.
  const chunkSize = 50;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("blog_posts").upsert(chunk, { onConflict: "slug" });
    if (error) {
      console.error(`[chunk ${i}] error:`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    console.log(`  upserted ${done}/${rows.length}`);
  }

  const { count, error: countErr } = await supabase
    .from("blog_posts")
    .select("*", { count: "exact", head: true });
  if (countErr) {
    console.error("count error:", countErr.message);
    process.exit(1);
  }
  console.log(`Done. blog_posts row count: ${count}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
