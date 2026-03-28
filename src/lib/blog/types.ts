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
}
