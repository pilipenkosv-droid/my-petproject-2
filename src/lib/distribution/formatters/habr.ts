/**
 * Форматирование статьи для Habr (markdown passthrough, полуавтомат)
 */

import type { BlogPost } from "@/lib/blog/posts";

export function formatForHabr(post: BlogPost): string {
  return [
    `# ${post.title}`,
    "",
    post.description,
    "",
    "---",
    "",
    post.content,
  ].join("\n");
}
