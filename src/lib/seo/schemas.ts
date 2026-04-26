/**
 * JSON-LD Schema генераторы для SEO/GEO оптимизации
 */

import { SITE_URL, SITE_NAME } from '@/lib/config/site'

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
    name: SITE_NAME,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: [
      {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RUB',
        description: 'Бесплатный пробный период — 1 документ, 50% страниц',
        availability: 'https://schema.org/InStock',
      },
      {
        '@type': 'Offer',
        price: '159',
        priceCurrency: 'RUB',
        description: 'Разовая обработка — 1 документ без ограничений по страницам',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/pricing`,
      },
      {
        '@type': 'Offer',
        price: '399',
        priceCurrency: 'RUB',
        description: 'Pro подписка — 10 обработок в месяц, все инструменты',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/pricing`,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '399',
          priceCurrency: 'RUB',
          unitText: 'MONTH',
          billingDuration: 'P1M',
        },
      },
      {
        '@type': 'Offer',
        price: '1499',
        priceCurrency: 'RUB',
        description: 'Pro Plus — 10 обработок + Diplox Bot в Telegram',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/second-brain`,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '1499',
          priceCurrency: 'RUB',
          unitText: 'MONTH',
          billingDuration: 'P1M',
        },
      },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '127',
      bestRating: '5',
      worstRating: '1',
    },
    description:
      'Сервис для подготовки научных работ: автоматическое форматирование по ГОСТу, проверка грамматики, подбор литературы, генерация плана и аннотации, повышение уникальности текста.',
    url: SITE_URL,
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
    screenshot: `${SITE_URL}/og-image.png`,
  }
}

/**
 * Schema для конкретного AI-инструмента (tool-page).
 * Сигналит Google что страница /rewrite, /grammar и т.д. — это самостоятельный
 * SoftwareApplication, а не просто блок главного сайта.
 */
export function getToolApplicationSchema(params: {
  name: string;
  url: string;
  description: string;
  category?: string;
  features?: string[];
  freeTier?: boolean;
}) {
  const { name, url, description, category = "EducationalApplication", features, freeTier = true } = params;

  const offers: object[] = [];
  if (freeTier) {
    offers.push({
      "@type": "Offer",
      price: "0",
      priceCurrency: "RUB",
      description: "Бесплатно: превью 50% результата без регистрации",
      availability: "https://schema.org/InStock",
    });
  }
  offers.push({
    "@type": "Offer",
    price: "399",
    priceCurrency: "RUB",
    description: "Pro подписка — 50 AI-операций/мес без обрезки",
    availability: "https://schema.org/InStock",
    url: `${SITE_URL}/pricing`,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: "399",
      priceCurrency: "RUB",
      unitText: "MONTH",
      billingDuration: "P1M",
    },
  });

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    applicationCategory: category,
    operatingSystem: "Web",
    url,
    description,
    inLanguage: "ru",
    offers,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "127",
      bestRating: "5",
      worstRating: "1",
    },
    ...(features ? { featureList: features } : {}),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

/**
 * Schema для WebSite (базовая информация о сайте)
 */
export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'Автоматическое форматирование научных работ по ГОСТу и методическим указаниям',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/blog?search={search_term_string}`,
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
  const image = post.image || `${SITE_URL}/og-image.png`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    url: `${SITE_URL}/blog/${post.slug}`,
    datePublished: post.datePublished,
    dateModified: post.dateModified || post.datePublished,
    image: {
      '@type': 'ImageObject',
      url: image,
      width: 1792,
      height: 1024,
    },
    author: {
      '@type': 'Person',
      name: 'Сергей Пилипенко',
      jobTitle: 'Founder & Developer, Diplox',
      url: `${SITE_URL}/about`,
      sameAs: ['https://sergejpilipenko.com'],
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo/d-icon-full.png`,
        width: 512,
        height: 512,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/blog/${post.slug}`,
    },
    inLanguage: 'ru-RU',
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
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
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
      url: `${SITE_URL}/pricing`,
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

/**
 * Schema для страницы тарифов (3 Product + Offer)
 */
export function getPricingSchemas() {
  const productImage = `${SITE_URL}/logo/d-icon-full.png`

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${SITE_NAME} — Пробный`,
      description: 'Бесплатная обработка 1 документа (50% страниц). AI-анализ структуры и форматирование по ГОСТу.',
      image: productImage,
      brand: { '@type': 'Organization', name: SITE_NAME },
      sku: 'diplox-trial',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/pricing`,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${SITE_NAME} — Разовая обработка`,
      description: 'Обработка 1 документа без ограничений по страницам. Форматирование по ГОСТу, AI-анализ, скачивание результата.',
      image: productImage,
      brand: { '@type': 'Organization', name: SITE_NAME },
      sku: 'diplox-single',
      offers: {
        '@type': 'Offer',
        price: '159',
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/pricing`,
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '127',
        bestRating: '5',
        worstRating: '1',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${SITE_NAME} Pro`,
      description: '10 обработок в месяц. Все инструменты: форматирование, грамматика, рерайт, подбор литературы. Приоритетная обработка.',
      image: productImage,
      brand: { '@type': 'Organization', name: SITE_NAME },
      sku: 'diplox-pro',
      offers: {
        '@type': 'Offer',
        price: '399',
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/pricing`,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '399',
          priceCurrency: 'RUB',
          unitText: 'MONTH',
        },
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '127',
        bestRating: '5',
        worstRating: '1',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${SITE_NAME} Pro Plus`,
      description: 'Всё из Pro + Diplox Bot в Telegram: заметки, AI-ответы из материалов, голосовые конспекты, ежедневная выжимка.',
      image: productImage,
      brand: { '@type': 'Organization', name: SITE_NAME },
      sku: 'diplox-pro-plus',
      offers: {
        '@type': 'Offer',
        price: '1499',
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/second-brain`,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '1499',
          priceCurrency: 'RUB',
          unitText: 'MONTH',
        },
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '127',
        bestRating: '5',
        worstRating: '1',
      },
    },
  ]
}

/**
 * Schema для Organization (E-E-A-T: идентичность бренда)
 */
export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo/d-icon-full.png`,
    description:
      'Сервис автоматического форматирования научных работ по ГОСТу с помощью ИИ. Поддерживает дипломы, курсовые, рефераты, диссертации.',
    foundingDate: '2025',
    sameAs: [
      'https://t.me/diplox_blog',
      'https://vk.com/club236935612',
      'https://dzen.ru/id/69bffa464441903916c18282',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'hello@diplox.online',
      availableLanguage: ['Russian'],
    },
  }
}

/**
 * Schema для SpeakableSpecification (голосовой поиск, AI-ассистенты)
 */
export function getSpeakableSchema(cssSelectors: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: cssSelectors,
    },
  }
}

/**
 * Schema для ItemList (список блог-статей, коллекции)
 */
export function getItemListSchema(
  items: { name: string; url: string; description?: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
      ...(item.description ? { description: item.description } : {}),
    })),
  }
}

/**
 * Schema для Person (E-E-A-T: основатель/автор)
 */
export function getFounderSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Сергей Пилипенко',
    jobTitle: 'Founder & Developer',
    url: 'https://sergejpilipenko.com',
    worksFor: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
  }
}
