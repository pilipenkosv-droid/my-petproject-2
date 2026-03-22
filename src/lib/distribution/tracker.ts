/**
 * Трекинг дистрибуции статей — CRUD для blog_distribution_log
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { BlogPost } from "@/lib/blog/posts";
import type { DistributionLogRow, DistributionPlatform } from "./types";

const TABLE = "blog_distribution_log";

export async function getUndistributedPosts(
  platform: DistributionPlatform,
  allPosts: BlogPost[]
): Promise<BlogPost[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(TABLE)
    .select("slug")
    .eq("platform", platform)
    .in("status", ["distributed", "skipped", "permanently_failed", "draft_ready"]);

  if (error) {
    console.error(`[distribution] getUndistributed error:`, error.message);
    return [];
  }

  const distributedSlugs = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  return allPosts.filter((post) => !distributedSlugs.has(post.slug));
}

export async function getPendingRetries(
  platform: DistributionPlatform
): Promise<DistributionLogRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("platform", platform)
    .eq("status", "failed")
    .lt("retry_count", 3)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[distribution] getPendingRetries error:`, error.message);
    return [];
  }

  return (data ?? []) as DistributionLogRow[];
}

export async function markDistributed(
  slug: string,
  platform: DistributionPlatform
): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase.from(TABLE).upsert(
    {
      slug,
      platform,
      status: "distributed",
      distributed_at: new Date().toISOString(),
      retry_count: 0,
      error_message: null,
    },
    { onConflict: "slug,platform" }
  );
}

export async function markFailed(
  slug: string,
  platform: DistributionPlatform,
  errorMsg: string,
  currentRetryCount: number
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const newCount = currentRetryCount + 1;
  const status = newCount >= 3 ? "permanently_failed" : "failed";

  await supabase.from(TABLE).upsert(
    {
      slug,
      platform,
      status,
      retry_count: newCount,
      error_message: errorMsg,
    },
    { onConflict: "slug,platform" }
  );
}

export async function markDraftReady(
  slug: string,
  platform: DistributionPlatform
): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase.from(TABLE).upsert(
    {
      slug,
      platform,
      status: "draft_ready",
      distributed_at: new Date().toISOString(),
    },
    { onConflict: "slug,platform" }
  );
}

export async function getDistributionLog(
  limit = 50
): Promise<DistributionLogRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[distribution] getDistributionLog error:`, error.message);
    return [];
  }

  return (data ?? []) as DistributionLogRow[];
}
