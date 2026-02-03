# SmartFormat

Веб-сервис автоматического форматирования научных работ (курсовые, дипломы, ВКР) по требованиям вуза и ГОСТу.

## Возможности

- Загрузка исходного документа (.docx) и требований к оформлению (.docx, .pdf, .txt)
- AI-извлечение правил форматирования из методички
- Редактирование и подтверждение правил перед обработкой
- Семантический AI-анализ структуры документа (секции, заголовки, библиография)
- Автоматическое форматирование с учётом контекста
- Выделение нарушений (красным) и исправлений (зелёным) в документе
- Двойной просмотр: оригинал и отформатированный документ бок о бок
- Статистика и список нарушений
- CSAT-виджет для оценки качества результата
- Система оплаты через Lava.top (разовая покупка / подписка)

## Технологии

| Категория | Стек |
|-----------|------|
| Frontend | Next.js 15, React 19, TypeScript |
| Стили | Tailwind CSS v4, shadcn/ui, Radix UI |
| AI | Gemini, OpenAI, Anthropic, Groq, OpenRouter, Cerebras (мульти-провайдер шлюз с фоллбэком) |
| Документы | mammoth (чтение DOCX), docx (создание DOCX), pdf-parse (PDF) |
| БД и хранилище | Supabase (PostgreSQL + Auth + Storage) |
| Оплата | Lava.top |
| Деплой | Vercel |
| Аналитика | Vercel Analytics |

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка окружения

```bash
cp .env.example .env.local
```

Заполните `.env.local` — минимально нужен хотя бы один AI-ключ и Supabase:

```env
# AI (достаточно одного, gateway выберет доступную модель)
GEMINI_API_KEY=ваш_ключ
GROQ_API_KEY=ваш_ключ

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_ключ
SUPABASE_SERVICE_ROLE_KEY=ваш_ключ
```

### 3. Запуск

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

### 4. Сборка

```bash
npm run build && npm run start
```

## Структура проекта

```
src/
├── app/                       # Next.js App Router (страницы + API)
│   ├── page.tsx              # Лендинг
│   ├── create/               # Загрузка документов
│   ├── confirm-rules/[jobId] # Подтверждение правил
│   ├── result/[jobId]        # Результаты
│   ├── pricing/              # Тарифы
│   ├── profile/              # Профиль пользователя
│   ├── login/                # Авторизация
│   ├── faq/                  # Вопросы и ответы (30+ FAQ)
│   ├── about/                # О сервисе
│   ├── blog/                 # Блог со статьями
│   ├── diplom/               # Landing: дипломные работы
│   ├── kursovaya/            # Landing: курсовые работы
│   ├── referat/              # Landing: рефераты
│   ├── esse/                 # Landing: эссе
│   ├── otchet-po-praktike/   # Landing: отчеты по практике
│   ├── sitemap.ts            # Динамический sitemap
│   └── api/                  # 14 API-эндпоинтов
├── features/                  # Feature-модули
│   ├── constructor/          # Загрузка и обработка
│   ├── result/               # Просмотр результатов, CSAT
│   └── confirm-rules/        # Редактор правил
├── components/                # Общие компоненты
│   ├── ui/                   # shadcn/ui (16+ компонентов)
│   ├── providers/            # React-провайдеры
│   ├── JsonLd.tsx            # JSON-LD structured data
│   └── WorkTypeLanding.tsx   # Шаблон landing page
├── lib/                       # Бизнес-логика
│   ├── ai/                   # AI-шлюз, модели, промпты, семантический парсер
│   ├── pipeline/             # Анализатор + форматтер документов
│   ├── documents/            # Чтение DOCX/PDF/TXT
│   ├── formatters/           # XML-форматирование, библиография
│   ├── storage/              # Supabase Storage + Job Store
│   ├── payment/              # Lava.top интеграция
│   ├── auth/                 # Авторизация и триал
│   ├── seo/                  # SEO-утилиты (schemas, metadata)
│   ├── blog/                 # Контент блога
│   └── utils/                # Утилиты + тесты
└── types/                     # TypeScript типы

public/
├── robots.txt                # Правила для поисковых ботов (вкл. AI-боты)
```

## SEO и GEO оптимизация

Проект оптимизирован для поисковых систем и AI-поисковиков:

- **robots.txt** — открыт доступ для GPTBot, ChatGPT-User, anthropic-ai, PerplexityBot
- **sitemap.xml** — динамическая генерация всех страниц
- **JSON-LD Schema** — SoftwareApplication, FAQPage, Article, BreadcrumbList
- **Landing pages** — отдельные страницы для каждого типа работ
- **Блог** — статьи о форматировании по ГОСТу
- **FAQ** — 30+ вопросов для индексации AI-системами

## Тарифы

| Тариф | Цена | Обработки | Лимит страниц |
|-------|------|-----------|---------------|
| Пробный | 0 ₽ | 1 бесплатная | Первые 30 стр. |
| Разовая | 159 ₽ | 1 документ | Без ограничений |
| Pro | 399 ₽/мес | 10 в месяц | Без ограничений |

## Документация

- [Архитектура проекта](docs/ARCHITECTURE.md) — пайплайн обработки, AI-шлюз, схема БД
- [Справочник API](docs/API.md) — все 14 эндпоинтов с форматами запросов и ответов
- [Деплой и настройка](docs/DEPLOYMENT.md) — Vercel, Supabase, переменные окружения
- [Журнал изменений](docs/CHANGES_SUMMARY.md) — история ключевых обновлений

## Лицензия

MIT
