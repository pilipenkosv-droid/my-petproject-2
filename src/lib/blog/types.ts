/**
 * Типы для блог-постов
 */

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  content: string;
  datePublished: string;
  dateModified?: string;
  keywords: string[];
  readingTime: string;
  coverImage?: string;
  /**
   * FAQ pairs — emitted as FAQPage schema.org JSON-LD on the blog post page.
   * Critical for AI search (ChatGPT / Perplexity / Google AI Overviews) and
   * Google "People Also Ask" boxes. Populate for top-impact posts.
   */
  faqs?: { question: string; answer: string }[];
  /**
   * TL;DR — краткое резюме поста (2-3 пункта с цифрами).
   * Рендерится в блоке .article-tldr перед контентом статьи.
   * Таргетируется SpeakableSpecification schema.org для AI-поиска.
   * string — один параграф; string[] — маркированный список.
   */
  tldr?: string | string[];
}
