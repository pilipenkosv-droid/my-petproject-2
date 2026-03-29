/**
 * Агрегатор блог-постов — объединяет посты из тематических файлов
 */

export type { BlogPost } from "./types";

import type { BlogPost } from "./types";
import { blogPostsGost } from "./posts-gost";
import { blogPostsSecondBrain } from "./posts-second-brain";
import { seasonalDraftPosts } from "./posts-seasonal-draft";

const allBlogPosts: BlogPost[] = [
  ...blogPostsGost,
  ...blogPostsSecondBrain,
  ...seasonalDraftPosts,
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

/** Кластер поста: gost (инструменты/оформление) или second-brain (AI-бот) */
function getPostCluster(slug: string): "gost" | "second-brain" {
  const isSecondBrain = blogPostsSecondBrain.some((p) => p.slug === slug);
  return isSecondBrain ? "second-brain" : "gost";
}

/** Похожие посты из того же кластера (исключая текущий) */
export function getRelatedPosts(slug: string, limit = 3): BlogPost[] {
  const cluster = getPostCluster(slug);
  const clusterPosts =
    cluster === "second-brain" ? blogPostsSecondBrain : blogPostsGost;

  return clusterPosts
    .filter((p) => p.slug !== slug)
    .sort(
      (a, b) =>
        new Date(b.datePublished).getTime() -
        new Date(a.datePublished).getTime()
    )
    .slice(0, limit);
}
