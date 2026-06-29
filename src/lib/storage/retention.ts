/**
 * Очистка устаревших строк в аналитических таблицах.
 * Запускается из runCleanup() раз в сутки.
 * Независимый try/catch на каждую таблицу — ошибка одной не блокирует остальные.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";

const PAGE_VIEWS_DAYS = 30;
const DOWNLOAD_EVENTS_DAYS = 90;
const EMAIL_SENT_LOG_DAYS = 90;
const BLOG_DISTRIBUTION_LOG_DAYS = 180;

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export async function cleanupRetentionTables(): Promise<Record<string, number>> {
  const admin = getSupabaseAdmin();

  const counts: Record<string, number> = {
    page_views: 0,
    download_events: 0,
    email_sent_log: 0,
    blog_distribution_log: 0,
    tool_outputs: 0,
  };

  // page_views: хранить 30 дней
  try {
    const { data, error } = await admin
      .from("page_views")
      .delete()
      .lt("created_at", cutoffIso(PAGE_VIEWS_DAYS))
      .select("id");
    if (error) {
      console.error("[retention] page_views error:", error);
    } else {
      counts.page_views = data?.length ?? 0;
    }
  } catch (err) {
    console.error("[retention] page_views exception:", err);
  }

  // download_events: хранить 90 дней
  try {
    const { data, error } = await admin
      .from("download_events")
      .delete()
      .lt("created_at", cutoffIso(DOWNLOAD_EVENTS_DAYS))
      .select("id");
    if (error) {
      console.error("[retention] download_events error:", error);
    } else {
      counts.download_events = data?.length ?? 0;
    }
  } catch (err) {
    console.error("[retention] download_events exception:", err);
  }

  // email_sent_log: колонка sent_at (не created_at), хранить 90 дней
  try {
    const { data, error } = await admin
      .from("email_sent_log")
      .delete()
      .lt("sent_at", cutoffIso(EMAIL_SENT_LOG_DAYS))
      .select("id");
    if (error) {
      console.error("[retention] email_sent_log error:", error);
    } else {
      counts.email_sent_log = data?.length ?? 0;
    }
  } catch (err) {
    console.error("[retention] email_sent_log exception:", err);
  }

  // blog_distribution_log: хранить 180 дней
  try {
    const { data, error } = await admin
      .from("blog_distribution_log")
      .delete()
      .lt("created_at", cutoffIso(BLOG_DISTRIBUTION_LOG_DAYS))
      .select("id");
    if (error) {
      console.error("[retention] blog_distribution_log error:", error);
    } else {
      counts.blog_distribution_log = data?.length ?? 0;
    }
  } catch (err) {
    console.error("[retention] blog_distribution_log exception:", err);
  }

  // tool_outputs: удалять строки, у которых expires_at уже наступил
  try {
    const { data, error } = await admin
      .from("tool_outputs")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("id");
    if (error) {
      console.error("[retention] tool_outputs error:", error);
    } else {
      counts.tool_outputs = data?.length ?? 0;
    }
  } catch (err) {
    console.error("[retention] tool_outputs exception:", err);
  }

  return counts;
}
