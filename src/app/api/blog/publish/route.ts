/**
 * POST /api/blog/publish
 *
 * Публикует/обновляет статью блога без Vercel rebuild. Используется ботом
 * Second Brain для автоматического постинга. После записи инвалидирует
 * ISR-кеш страниц блога и sitemap — новый пост появляется на сайте за
 * максимум 60 секунд.
 *
 * Auth: Bearer ${BLOG_PUBLISH_TOKEN}.
 *
 * Body (JSON, BlogPost-совместимый):
 *   slug: string                     — primary key
 *   title: string
 *   description: string
 *   content: string                  — markdown
 *   datePublished: "YYYY-MM-DD"
 *   dateModified?: "YYYY-MM-DD"
 *   keywords: string[]
 *   readingTime: string              — "5 мин"
 *   coverImage?: string              — URL
 *   faqs?: { question, answer }[]
 *   tldr?: string | string[]
 *   cluster?: "second-brain" | "gost" — default "second-brain"
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { BLOG_POSTS_CACHE_TAG } from "@/lib/blog/posts-db";

export const runtime = "nodejs";
export const maxDuration = 30;

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const PostSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(1000),
  content: z.string().min(1),
  datePublished: z.string().regex(dateRe, "datePublished must be YYYY-MM-DD"),
  dateModified: z.string().regex(dateRe).optional(),
  keywords: z.array(z.string()).default([]),
  readingTime: z.string().min(1).max(50),
  coverImage: z.string().url().optional(),
  faqs: z
    .array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
    .optional(),
  tldr: z.union([z.string(), z.array(z.string())]).optional(),
  cluster: z.enum(["second-brain", "gost"]).default("second-brain"),
});

function unauthorized(reason: string) {
  return NextResponse.json({ ok: false, error: reason }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.BLOG_PUBLISH_TOKEN;
  if (!expectedToken) {
    return NextResponse.json(
      { ok: false, error: "BLOG_PUBLISH_TOKEN not configured" },
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return unauthorized("missing bearer token");
  if (auth.slice(7) !== expectedToken) return unauthorized("invalid token");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation_failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const post = parsed.data;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("blog_posts").upsert(
    {
      slug: post.slug,
      title: post.title,
      description: post.description,
      content: post.content,
      date_published: post.datePublished,
      date_modified: post.dateModified ?? null,
      keywords: post.keywords,
      reading_time: post.readingTime,
      cover_image: post.coverImage ?? null,
      faqs: post.faqs ?? null,
      tldr: post.tldr ?? null,
      cluster: post.cluster,
    },
    { onConflict: "slug" }
  );

  if (error) {
    console.error("[blog/publish] upsert error:", error);
    return NextResponse.json(
      { ok: false, error: "db_error", message: error.message },
      { status: 500 }
    );
  }

  revalidateTag(BLOG_POSTS_CACHE_TAG);
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/sitemap.xml");
  revalidatePath("/api/rss");

  return NextResponse.json({ ok: true, slug: post.slug });
}
