/**
 * Форматирование статьи для Telegram Bot API (HTML parse_mode)
 */

import type { BlogPost } from "@/lib/blog/posts";

const SITE_URL = "https://diplox.online";
const MAX_DESCRIPTION_LENGTH = 300;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toHashtags(keywords: string[]): string {
  return keywords
    .slice(0, 3)
    .map((kw) => "#" + kw.replace(/[\s-]+/g, "_").replace(/[^а-яА-Яa-zA-Z0-9_]/g, ""))
    .join(" ");
}

export function formatForTelegram(post: BlogPost): string {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const description = truncate(escapeHtml(post.description), MAX_DESCRIPTION_LENGTH);
  const hashtags = toHashtags(post.keywords);

  return [
    `<b>${escapeHtml(post.title)}</b>`,
    "",
    description,
    "",
    `<a href="${url}">Читать на сайте →</a>`,
    "",
    hashtags,
  ].join("\n");
}
