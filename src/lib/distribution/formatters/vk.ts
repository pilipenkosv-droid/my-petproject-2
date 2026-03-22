/**
 * Форматирование статьи для VK wall.post (plain text)
 */

import type { BlogPost } from "@/lib/blog/posts";

const SITE_URL = "https://diplox.online";

export function formatForVk(post: BlogPost): {
  message: string;
  attachments: string;
} {
  const url = `${SITE_URL}/blog/${post.slug}`;

  const message = [
    post.title,
    "",
    post.description,
    "",
    `Читать полностью: ${url}`,
  ].join("\n");

  return { message, attachments: url };
}
