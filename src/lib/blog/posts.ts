/**
 * Агрегатор блог-постов — объединяет посты из тематических файлов
 */

export type { BlogPost } from "./types";

import type { BlogPost } from "./types";
import { blogPostsGost } from "./posts-gost";
import { blogPostsSecondBrain } from "./posts-second-brain";

const allBlogPosts: BlogPost[] = [
  ...blogPostsGost,
  ...blogPostsSecondBrain,
];

/** Обратная совместимость */
export const blogPosts = allBlogPosts;

export function getPostBySlug(slug: string): BlogPost | undefined {
  return allBlogPosts.find((post) => post.slug === slug);
}

export function getAllPosts(): BlogPost[] {
  return [...allBlogPosts].sort(
    (a, b) =>
      new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
  );
}
