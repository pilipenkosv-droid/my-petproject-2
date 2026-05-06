/**
 * Агрегатор блог-постов.
 *
 * Источник Second Brain постов — Supabase (`blog_posts` table).
 * Static TS-кластеры (gost / pain-clusters / seasonal-draft) остаются в коде,
 * т.к. это SEO-ядро, меняется редко. Static cluster = 'gost'.
 *
 * Все экспортируемые функции async — Second Brain читается из БД с ISR-кешем
 * (см. posts-db.ts, тег "blog-posts").
 */

export type { BlogPost } from "./types";

import type { BlogPost } from "./types";
import { blogPostsGost } from "./posts-gost";
import { seasonalDraftPosts } from "./posts-seasonal-draft";
import { blogPostsPainClusters } from "./posts-pain-clusters";
import { blogPostsSecondBrain } from "./posts-second-brain";
import { fetchSecondBrainPosts } from "./posts-db";

const staticGostPosts: BlogPost[] = [
  ...blogPostsGost,
  ...seasonalDraftPosts,
  ...blogPostsPainClusters,
];

/**
 * @deprecated Snapshot всех постов из TS-модулей (включая Second Brain до миграции
 * в БД). Используется только локальными SEO-скриптами (seo-content-audit,
 * yandex-keyword-extend), которые работают синхронно. Runtime блог использует
 * async getAllPosts() — там Second Brain читается из таблицы blog_posts.
 */
export const blogPosts: BlogPost[] = [
  ...staticGostPosts,
  ...blogPostsSecondBrain,
];

function sortByDateDesc(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort(
    (a, b) =>
      new Date(b.datePublished).getTime() -
      new Date(a.datePublished).getTime()
  );
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const dbPosts = await fetchSecondBrainPosts();
  return sortByDateDesc([...staticGostPosts, ...dbPosts]);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const fromStatic = staticGostPosts.find((p) => p.slug === slug);
  if (fromStatic) return fromStatic;
  const dbPosts = await fetchSecondBrainPosts();
  return dbPosts.find((p) => p.slug === slug);
}

/** Кластер поста: gost (статика) или second-brain (БД). */
async function getPostCluster(slug: string): Promise<"gost" | "second-brain"> {
  if (staticGostPosts.some((p) => p.slug === slug)) return "gost";
  return "second-brain";
}

/**
 * Посты, релевантные лендингу (diplom/kursovaya/referat/…) по ключевому слову в title/keywords.
 * Только из gost-кластера — статичный SEO-набор. Sync, без БД.
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

/** Похожие посты из того же кластера (исключая текущий). */
export async function getRelatedPosts(slug: string, limit = 3): Promise<BlogPost[]> {
  const cluster = await getPostCluster(slug);
  const clusterPosts =
    cluster === "second-brain" ? await fetchSecondBrainPosts() : staticGostPosts;

  return sortByDateDesc(clusterPosts.filter((p) => p.slug !== slug)).slice(0, limit);
}
