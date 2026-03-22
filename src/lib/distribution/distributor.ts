/**
 * Оркестратор дистрибуции: связывает форматтеры, клиенты и трекер
 */

import type { BlogPost } from "@/lib/blog/posts";
import type { DistributionConfig, DistributionPlatform, DistributionResult } from "./types";
import { getDistributionConfig } from "./config";
import {
  getUndistributedPosts,
  getPendingRetries,
  markDistributed,
  markFailed,
  markDraftReady,
} from "./tracker";

import { formatForTelegram } from "./formatters/telegram";
import { formatForVk } from "./formatters/vk";
import { formatForVc } from "./formatters/vc";

import { sendToTelegramChannel } from "./clients/telegram-client";
import { postToVkWall } from "./clients/vk-client";
import { createVcEntry } from "./clients/vc-client";

const PLATFORMS: DistributionPlatform[] = ["telegram", "vk", "vc", "habr"];

async function distributeOne(
  post: BlogPost,
  platform: DistributionPlatform,
  config: DistributionConfig,
  retryCount = 0
): Promise<DistributionResult> {
  try {
    switch (platform) {
      case "telegram": {
        if (!config.telegram.enabled) {
          return { platform, slug: post.slug, ok: false, error: "not_configured" };
        }
        const text = formatForTelegram(post);
        await sendToTelegramChannel(text, config.telegram, post.coverImage);
        await markDistributed(post.slug, platform);
        return { platform, slug: post.slug, ok: true };
      }

      case "vk": {
        if (!config.vk.enabled) {
          return { platform, slug: post.slug, ok: false, error: "not_configured" };
        }
        const { message, attachments } = formatForVk(post);
        await postToVkWall(message, attachments, config.vk, post.coverImage);
        await markDistributed(post.slug, platform);
        return { platform, slug: post.slug, ok: true };
      }

      case "vc": {
        if (!config.vc.enabled) {
          return { platform, slug: post.slug, ok: false, error: "not_configured" };
        }
        const { title, text } = formatForVc(post);
        await createVcEntry(title, text, config.vc);
        await markDistributed(post.slug, platform);
        return { platform, slug: post.slug, ok: true };
      }

      case "habr": {
        if (!config.habr.enabled) {
          return { platform, slug: post.slug, ok: false, error: "not_configured" };
        }
        await markDraftReady(post.slug, platform);
        return { platform, slug: post.slug, ok: true };
      }

      default:
        return { platform, slug: post.slug, ok: false, error: "unknown_platform" };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[distribution] ${platform}/${post.slug} failed:`, errorMsg);
    await markFailed(post.slug, platform, errorMsg, retryCount);
    return { platform, slug: post.slug, ok: false, error: errorMsg };
  }
}

export async function distributeAll(
  allPosts: BlogPost[]
): Promise<{ results: DistributionResult[]; processed: number }> {
  const config = getDistributionConfig();
  const results: DistributionResult[] = [];
  let processed = 0;

  for (const platform of PLATFORMS) {
    // Новые статьи
    const newPosts = await getUndistributedPosts(platform, allPosts);
    const batch = newPosts.slice(0, config.batchSize);

    for (const post of batch) {
      const result = await distributeOne(post, platform, config);
      results.push(result);
      if (result.ok) processed++;
    }

    // Ретраи
    const retries = await getPendingRetries(platform);
    for (const row of retries.slice(0, config.batchSize)) {
      const post = allPosts.find((p) => p.slug === row.slug);
      if (!post) continue;
      const result = await distributeOne(post, platform, config, row.retry_count);
      results.push(result);
      if (result.ok) processed++;
    }
  }

  return { results, processed };
}
