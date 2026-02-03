import { MetadataRoute } from 'next'

const BASE_URL = 'https://ai-sformat.vercel.app'

// Статьи блога (будут добавлены позже)
const blogPosts = [
  { slug: 'kak-oformit-diplom-po-gostu', date: '2025-01-15' },
  { slug: 'trebovaniya-k-kursovoj-rabote', date: '2025-01-20' },
  { slug: 'otstupy-i-intervaly-po-gostu', date: '2025-01-25' },
  { slug: 'spisok-literatury-gost-7-1', date: '2025-01-28' },
  { slug: 'formatirovanie-tablic-i-risunkov', date: '2025-02-01' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString()

  // Основные страницы
  const mainPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/create`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]

  // Landing pages по типам работ
  const workTypePages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/diplom`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/kursovaya`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/referat`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/esse`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/otchet-po-praktike`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]

  // Блог
  const blogPage: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  // Статьи блога
  const blogPostPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...mainPages, ...workTypePages, ...blogPage, ...blogPostPages]
}
