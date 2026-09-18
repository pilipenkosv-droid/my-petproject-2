/**
 * Агрегатор блог-постов.
 *
 * Источник обоих кластеров — Supabase (`blog_posts`). Статические TS-массивы
 * ГОСТ-кластера остаются резервом: они отдаются, пока в БД нет ни одной строки
 * с cluster='gost' (до бэкфилла, см. scripts/blog/backfill-gost-posts.ts) и при
 * сбое БД.
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
import { fetchGostPosts, fetchSecondBrainPosts } from "./posts-db";

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

/**
 * ГОСТ-кластер: из БД, если бэкфилл уже прошёл (есть хотя бы одна строка),
 * иначе статика — чтобы блог не опустел до бэкфилла и при сбое БД.
 */
async function getGostPosts(): Promise<BlogPost[]> {
  const dbGost = await fetchGostPosts();
  return dbGost.length > 0 ? dbGost : staticGostPosts;
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const [gostPosts, dbPosts] = await Promise.all([
    getGostPosts(),
    fetchSecondBrainPosts(),
  ]);
  return sortByDateDesc([...gostPosts, ...dbPosts]);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const gostPosts = await getGostPosts();
  const fromGost = gostPosts.find((p) => p.slug === slug);
  if (fromGost) return fromGost;
  const dbPosts = await fetchSecondBrainPosts();
  return dbPosts.find((p) => p.slug === slug);
}

/** Кластер поста: gost или second-brain. */
async function getPostCluster(slug: string): Promise<"gost" | "second-brain"> {
  const gostPosts = await getGostPosts();
  if (gostPosts.some((p) => p.slug === slug)) return "gost";
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
    cluster === "second-brain" ? await fetchSecondBrainPosts() : await getGostPosts();

  return sortByDateDesc(clusterPosts.filter((p) => p.slug !== slug)).slice(0, limit);
}
