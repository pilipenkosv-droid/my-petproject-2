/**
 * Генерация RSS 2.0 фида для блога
 */

import type { BlogPost } from "@/lib/blog/posts";

const SITE_URL = "https://diplox.online";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc2822(dateStr: string): string {
  return new Date(dateStr).toUTCString();
}

export function buildRssFeed(posts: BlogPost[]): string {
  const items = posts
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${toRfc2822(post.datePublished)}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>${
        post.coverImage
          ? `\n      <enclosure url="${SITE_URL}${post.coverImage}" type="image/png" />`
          : ""
      }
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Diplox — блог</title>
    <link>${SITE_URL}/blog</link>
    <description>Статьи об оформлении научных работ, ГОСТах и AI-инструментах для студентов</description>
    <language>ru</language>
    <lastBuildDate>${toRfc2822(posts[0]?.datePublished || new Date().toISOString())}</lastBuildDate>
    <atom:link href="${SITE_URL}/api/rss" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}
