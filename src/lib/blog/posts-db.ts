import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { BlogPost } from "./types";

export const BLOG_POSTS_CACHE_TAG = "blog-posts";

interface BlogPostRow {
  slug: string;
  title: string;
  description: string;
  content: string;
  date_published: string;
  date_modified: string | null;
  keywords: string[];
  reading_time: string;
  cover_image: string | null;
  faqs: { question: string; answer: string }[] | null;
  tldr: string | string[] | null;
  cluster: "second-brain" | "gost";
}

export type DbBlogPost = BlogPost & { cluster: "second-brain" | "gost" };

function rowToPost(row: BlogPostRow): DbBlogPost {
  return {
    cluster: row.cluster ?? "second-brain",
    slug: row.slug,
    title: row.title,
    description: row.description,
    content: row.content,
    datePublished: row.date_published,
    dateModified: row.date_modified ?? undefined,
    keywords: row.keywords,
    readingTime: row.reading_time,
    coverImage: row.cover_image ?? undefined,
    faqs: row.faqs ?? undefined,
    tldr: row.tldr ?? undefined,
  };
}

async function fetchAllDbPostsRaw(): Promise<DbBlogPost[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(
      "slug,title,description,content,date_published,date_modified,keywords,reading_time,cover_image,faqs,tldr,cluster"
    )
    .order("date_published", { ascending: false });

  if (error) {
    console.error("[blog/posts-db] fetch error:", error.message);
    return [];
  }
  return (data ?? []).map((r) => rowToPost(r as BlogPostRow));
}

export const fetchAllDbPosts = unstable_cache(
  fetchAllDbPostsRaw,
  ["blog-posts:all"],
  { tags: [BLOG_POSTS_CACHE_TAG], revalidate: 3600 }
);

/** Посты кластера бота. */
export async function fetchSecondBrainPosts(): Promise<BlogPost[]> {
  const posts = await fetchAllDbPosts();
  return posts.filter((p) => p.cluster === "second-brain");
}

/** Посты ГОСТ-кластера — их пишет ночной конвейер (ops/blog-nightly). */
export async function fetchGostPosts(): Promise<BlogPost[]> {
  const posts = await fetchAllDbPosts();
  return posts.filter((p) => p.cluster === "gost");
}
