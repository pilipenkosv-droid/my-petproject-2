/**
 * Хелперы для генерации метатегов
 */

import { Metadata } from 'next'

const BASE_URL = 'https://sformat.online'
const SITE_NAME = 'SmartFormat'

interface PageMetadataOptions {
  title: string
  description: string
  path?: string
  keywords?: string[]
  noIndex?: boolean
  ogImage?: string
}

/**
 * Генерация метаданных для страницы
 */
export function generatePageMetadata({
  title,
  description,
  path = '',
  keywords = [],
  noIndex = false,
  ogImage,
}: PageMetadataOptions): Metadata {
  const url = `${BASE_URL}${path}`
  const fullTitle = path === '' ? title : `${title} | ${SITE_NAME}`

  const defaultKeywords = [
    'форматирование по ГОСТу',
    'оформление диплома',
    'оформление курсовой',
    'автоматическое форматирование',
    'SmartFormat',
    'ГОСТ 7.32-2017',
    'оформление научных работ',
    'оформление диссертации',
    'оформление ВКР',
    'AI форматирование документов',
    'нейросеть для оформления работ',
    'форматирование по ГОСТу 2026',
    'сервис оформления по ГОСТу',
    'автоматическое оформление диплома',
    'помощь с оформлением',
  ]

  return {
    title: fullTitle,
    description,
    keywords: [...defaultKeywords, ...keywords],
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'ru_RU',
      type: 'website',
      images: ogImage
        ? [{ url: ogImage, width: 1200, height: 630, alt: title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  }
}

/**
 * Метаданные для страниц типов работ
 */
export function getWorkTypeMetadata(
  type: 'diplom' | 'kursovaya' | 'referat' | 'esse' | 'otchet-po-praktike' | 'vkr' | 'magisterskaya'
): Metadata {
  const metadata: Record<typeof type, PageMetadataOptions> = {
    diplom: {
      title: 'Форматирование дипломной работы по ГОСТу онлайн 2026',
      description:
        'Автоматическое AI-форматирование дипломной работы по ГОСТу и методичке вуза. Загрузите диплом — получите идеально оформленный документ за минуты. Отступы, шрифты, интервалы по стандарту.',
      path: '/diplom',
      keywords: [
        'форматирование диплома',
        'оформление дипломной работы',
        'диплом по ГОСТу',
        'ГОСТ дипломная работа',
        'оформить диплом онлайн',
        'оформление диплома 2026',
        'требования к дипломной работе 2026',
      ],
    },
    kursovaya: {
      title: 'Форматирование курсовой работы и курсового проекта по ГОСТу онлайн',
      description:
        'Автоматическое AI-форматирование курсовой работы и курсового проекта по ГОСТу. Загрузите курсовую и методичку — система сама применит все требования к оформлению.',
      path: '/kursovaya',
      keywords: [
        'форматирование курсовой',
        'оформление курсовой работы',
        'курсовая по ГОСТу',
        'ГОСТ курсовая работа',
        'оформить курсовую онлайн',
        'курсовой проект оформление',
        'форматирование курсового проекта',
      ],
    },
    referat: {
      title: 'Форматирование реферата по ГОСТу онлайн',
      description:
        'Быстрое форматирование реферата по ГОСТу. Загрузите реферат — получите правильно оформленный документ с корректными полями, шрифтами и отступами.',
      path: '/referat',
      keywords: [
        'форматирование реферата',
        'оформление реферата',
        'реферат по ГОСТу',
        'ГОСТ реферат',
        'оформить реферат онлайн',
      ],
    },
    esse: {
      title: 'Форматирование эссе по стандартам онлайн',
      description:
        'Автоматическое форматирование эссе по требованиям вуза. Загрузите эссе и методические указания — система применит все необходимые параметры оформления.',
      path: '/esse',
      keywords: [
        'форматирование эссе',
        'оформление эссе',
        'эссе по ГОСТу',
        'требования к эссе',
        'оформить эссе онлайн',
      ],
    },
    'otchet-po-praktike': {
      title: 'Форматирование отчета по практике по ГОСТу онлайн',
      description:
        'Автоматическое форматирование отчета по практике по ГОСТу и методичке. Загрузите отчет — получите документ с правильным оформлением титульного листа, содержания и основной части.',
      path: '/otchet-po-praktike',
      keywords: [
        'форматирование отчета по практике',
        'оформление отчета по практике',
        'отчет по практике ГОСТ',
        'оформить отчет по практике',
        'отчет по практике онлайн',
      ],
    },
    vkr: {
      title: 'Форматирование ВКР по ГОСТу онлайн',
      description:
        'Автоматическое форматирование выпускной квалификационной работы (ВКР) по ГОСТу и методичке вуза. Загрузите ВКР — получите идеально оформленный документ за минуты.',
      path: '/vkr',
      keywords: [
        'форматирование ВКР',
        'оформление ВКР',
        'выпускная квалификационная работа',
        'ВКР по ГОСТу',
        'оформить ВКР онлайн',
        'требования к ВКР 2026',
      ],
    },
    magisterskaya: {
      title: 'Форматирование магистерской диссертации по ГОСТу онлайн',
      description:
        'Автоматическое форматирование магистерской диссертации по ГОСТу и методичке вуза. Загрузите диссертацию — получите идеально оформленный документ за минуты.',
      path: '/magisterskaya',
      keywords: [
        'форматирование магистерской диссертации',
        'оформление магистерской',
        'магистерская диссертация ГОСТ',
        'оформить магистерскую онлайн',
        'ГОСТ Р 7.0.11-2011',
        'оформление диссертации 2026',
      ],
    },
  }

  return generatePageMetadata(metadata[type])
}

/**
 * Метаданные для блог-поста
 */
export function getBlogPostMetadata(
  title: string,
  description: string,
  slug: string,
  keywords: string[] = []
): Metadata {
  return generatePageMetadata({
    title,
    description,
    path: `/blog/${slug}`,
    keywords: [...keywords, 'ГОСТ', 'оформление', 'научная работа'],
  })
}
