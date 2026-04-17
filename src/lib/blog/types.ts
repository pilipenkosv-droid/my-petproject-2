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
}
