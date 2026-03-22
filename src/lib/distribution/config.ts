/**
 * Конфигурация дистрибуции — читает env vars, graceful degradation
 */

import type { DistributionConfig } from "./types";

export function getDistributionConfig(): DistributionConfig {
  return {
    telegram: {
      enabled: Boolean(
        process.env.DISTRIBUTION_TELEGRAM_BOT_TOKEN &&
          process.env.DISTRIBUTION_TELEGRAM_CHANNEL_ID
      ),
      botToken: process.env.DISTRIBUTION_TELEGRAM_BOT_TOKEN || "",
      channelId: process.env.DISTRIBUTION_TELEGRAM_CHANNEL_ID || "",
    },
    vk: {
      enabled: Boolean(
        process.env.DISTRIBUTION_VK_TOKEN &&
          process.env.DISTRIBUTION_VK_GROUP_ID
      ),
      token: process.env.DISTRIBUTION_VK_TOKEN || "",
      groupId: process.env.DISTRIBUTION_VK_GROUP_ID || "",
    },
    vc: {
      enabled: Boolean(
        process.env.DISTRIBUTION_VC_TOKEN &&
          process.env.DISTRIBUTION_VC_SUBSITE_ID
      ),
      token: process.env.DISTRIBUTION_VC_TOKEN || "",
      subsiteId: process.env.DISTRIBUTION_VC_SUBSITE_ID || "",
    },
    habr: {
      enabled: process.env.DISTRIBUTION_HABR_ENABLED === "true",
    },
    batchSize: Number(process.env.DISTRIBUTION_BATCH_SIZE) || 3,
    siteUrl: "https://diplox.online",
  };
}
