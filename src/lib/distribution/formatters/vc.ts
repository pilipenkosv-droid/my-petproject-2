/**
 * Форматирование статьи для VC.ru API (Editor.js JSON)
 */

import type { BlogPost } from "@/lib/blog/posts";

const SITE_URL = "https://diplox.online";

interface EditorJsBlock {
  type: string;
  data: Record<string, unknown>;
}

export function formatForVc(post: BlogPost): {
  title: string;
  text: string;
} {
  const url = `${SITE_URL}/blog/${post.slug}`;

  const blocks: EditorJsBlock[] = [
    {
      type: "paragraph",
      data: { text: post.description },
    },
    {
      type: "paragraph",
      data: {
        text: `<a href="${url}">Читать статью полностью на Diplox →</a>`,
      },
    },
  ];

  return {
    title: post.title,
    text: JSON.stringify({ blocks }),
  };
}
