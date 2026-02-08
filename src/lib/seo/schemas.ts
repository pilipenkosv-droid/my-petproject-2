/**
 * JSON-LD Schema генераторы для SEO/GEO оптимизации
 */

const BASE_URL = 'https://ai-sformat.vercel.app'

export interface FAQItem {
  question: string
  answer: string
}

export interface BlogPost {
  title: string
  description: string
  slug: string
  datePublished: string
  dateModified?: string
  image?: string
}

export interface BreadcrumbItem {
  name: string
  url: string
}

/**
 * Schema для SoftwareApplication (основной продукт)
 */
export function getSoftwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SmartFormat',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'RUB',
      description: 'Бесплатный пробный период',
    },
    description:
      'Сервис для подготовки научных работ: автоматическое форматирование по ГОСТу, проверка грамматики, подбор литературы, генерация плана и аннотации, повышение уникальности текста.',
    url: BASE_URL,
    featureList: [
      'Автоматическое форматирование по ГОСТу',
      'Анализ методических указаний',
      'Поддержка дипломов, курсовых, рефератов',
      'AI-powered обработка документов',
      'Сохранение оригинальной структуры текста',
      'Форматирование по ГОСТ 7.32-2017',
      'Оформление списка литературы по ГОСТ 7.1',
      'Поддержка диссертаций (ГОСТ Р 7.0.11-2011)',
      'Оформление таблиц, рисунков и формул',
      'Проверка грамматики и орфографии',
      'Подбор научной литературы из OpenAlex и CrossRef',
      'Генерация краткого содержания (аннотации) с помощью ИИ',
      'Повышение уникальности текста (рерайт)',
      'Генератор плана работы с разделами и подразделами',
    ],
    screenshot: `${BASE_URL}/og-image.png`,
  }
}

/**
 * Schema для WebSite (базовая информация о сайте)
 */
export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'SmartFormat',
    url: BASE_URL,
    description:
      'Автоматическое форматирование научных работ по ГОСТу и методическим указаниям',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE_URL}/blog?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

/**
 * Schema для FAQPage
 */
export function getFAQPageSchema(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

/**
 * Schema для Article (блог-пост)
 */
export function getArticleSchema(post: BlogPost) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    url: `${BASE_URL}/blog/${post.slug}`,
    datePublished: post.datePublished,
    dateModified: post.dateModified || post.datePublished,
    image: post.image || `${BASE_URL}/og-image.png`,
    author: {
      '@type': 'Organization',
      name: 'SmartFormat',
      url: BASE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'SmartFormat',
      url: BASE_URL,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${BASE_URL}/blog/${post.slug}`,
    },
  }
}

/**
 * Schema для BreadcrumbList
 */
export function getBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url}`,
    })),
  }
}

/**
 * Schema для Product/Service (тарифы)
 */
export function getProductSchema(
  name: string,
  description: string,
  price: number,
  priceCurrency: string = 'RUB'
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    offers: {
      '@type': 'Offer',
      price: price.toString(),
      priceCurrency,
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/pricing`,
    },
  }
}

/**
 * Schema для HowTo (инструкции)
 */
export function getHowToSchema(
  name: string,
  description: string,
  steps: { name: string; text: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  }
}
