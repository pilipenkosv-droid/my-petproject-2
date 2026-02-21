import { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog/posts'

import { SITE_URL } from '@/lib/config/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString()

  // Основные страницы
  const mainPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/create`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]

  // Landing pages по типам работ
  const workTypePages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/diplom`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/kursovaya`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/referat`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/esse`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/otchet-po-praktike`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/vkr`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/magisterskaya`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]

  // Инструменты (tool pages)
  const toolPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/grammar`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/sources`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/summarize`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/rewrite`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/outline`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]

  // Блог
  const blogPage: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  // Статьи блога (автоматически из posts.ts)
  const allPosts = getAllPosts()
  const blogPostPages: MetadataRoute.Sitemap = allPosts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.dateModified || post.datePublished,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...mainPages, ...workTypePages, ...toolPages, ...blogPage, ...blogPostPages]
}
