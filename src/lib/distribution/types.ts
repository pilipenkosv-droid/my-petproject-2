/**
 * Типы для системы дистрибуции статей блога
 */

export type DistributionPlatform = "telegram" | "vk" | "vc" | "habr";

export type DistributionStatus =
  | "pending"
  | "distributed"
  | "failed"
  | "permanently_failed"
  | "skipped"
  | "draft_ready";

export interface DistributionResult {
  platform: DistributionPlatform;
  slug: string;
  ok: boolean;
  error?: string;
}

export interface DistributionLogRow {
  id: string;
  slug: string;
  platform: DistributionPlatform;
  status: DistributionStatus;
  retry_count: number;
  error_message: string | null;
  distributed_at: string | null;
  created_at: string;
}

export interface PlatformConfig {
  enabled: boolean;
}

export interface TelegramConfig extends PlatformConfig {
  botToken: string;
  channelId: string;
}

export interface VkConfig extends PlatformConfig {
  token: string;
  groupId: string;
}

export interface VcConfig extends PlatformConfig {
  token: string;
  subsiteId: string;
}

export interface HabrConfig extends PlatformConfig {}

export interface DistributionConfig {
  telegram: TelegramConfig;
  vk: VkConfig;
  vc: VcConfig;
  habr: HabrConfig;
  batchSize: number;
  siteUrl: string;
}
