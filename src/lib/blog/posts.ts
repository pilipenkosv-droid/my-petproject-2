/**
 * Агрегатор блог-постов — объединяет посты из тематических файлов
 */

export type { BlogPost } from "./types";

import type { BlogPost } from "./types";
import { blogPostsGost } from "./posts-gost";
import { blogPostsSecondBrain } from "./posts-second-brain";
import { seasonalDraftPosts } from "./posts-seasonal-draft";
import { blogPostsPainClusters } from "./posts-pain-clusters";

const allBlogPosts: BlogPost[] = [
  ...blogPostsGost,
  ...blogPostsSecondBrain,
  ...seasonalDraftPosts,
  ...blogPostsPainClusters,
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

/** Кластер поста: gost (инструменты/оформление) или second-brain (Diplox Bot) */
function getPostCluster(slug: string): "gost" | "second-brain" {
  const isSecondBrain = blogPostsSecondBrain.some((p) => p.slug === slug);
  return isSecondBrain ? "second-brain" : "gost";
}

/**
 * Посты, релевантные лендингу (diplom/kursovaya/referat/…) по ключевому слову в title/keywords.
 * Используется для hub-пажей — улучшает внутреннюю перелинковку и распределение PageRank.
 */
export function getPostsForWorkType(workType: string, limit = 6): BlogPost[] {
  const terms: Record<string, string[]> = {
    diplom: ["диплом", "дипломн", "вкр"],
    kursovaya: ["курсов"],
    referat: ["реферат"],
    esse: ["эссе"],
    vkr: ["вкр", "диплом"],
    magisterskaya: ["магист", "диссерт"],
    "otchet-po-praktike": ["практик", "отчёт", "отчет"],
  };
  const tokens = terms[workType] || [workType];
  return blogPostsGost
    .filter((p) => {
      const hay = (p.title + " " + p.keywords.join(" ") + " " + p.slug).toLowerCase();
      return tokens.some((t) => hay.includes(t));
    })
    .sort(
      (a, b) =>
        new Date(b.datePublished).getTime() -
        new Date(a.datePublished).getTime()
    )
    .slice(0, limit);
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
