# Деплой и настройка

## Платформа

- **Хостинг:** Vercel (Next.js serverless)
- **CDN:** Cloudflare (проксирование + кеширование статики)
- **БД / Auth / Storage:** Supabase
- **Оплата:** Lava.top

## Переменные окружения

### AI-провайдеры

Gateway автоматически использует модели с настроенными ключами. Достаточно одного ключа.

| Переменная | Обязательна | Описание |
|-----------|-------------|----------|
| `GEMINI_API_KEY` | Рекомендуется | Google Gemini (бесплатный, 60 запросов/день на 3 модели) |
| `GROQ_API_KEY` | Рекомендуется | Groq (14400 запросов/день, быстрый) |
| `OPENROUTER_API_KEY` | Опционально | OpenRouter (бесплатные модели) |
| `CEREBRAS_API_KEY` | Опционально | Cerebras (1000 запросов/день) |
| `OPENAI_API_KEY` | Опционально | OpenAI (платный) |
| `ANTHROPIC_API_KEY` | Опционально | Anthropic Claude (платный) |

### Supabase

| Переменная | Обязательна | Описание |
|-----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Да | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Да | Публичный ключ (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Да | Сервисный ключ (admin) |

### Оплата (Lava.top)

| Переменная | Обязательна | Описание |
|-----------|-------------|----------|
| `LAVA_API_KEY` | Да (для оплаты) | API-ключ Lava.top |
| `LAVA_WEBHOOK_LOGIN` | Да (для оплаты) | Логин для Basic Auth вебхуков |
| `LAVA_WEBHOOK_PASSWORD` | Да (для оплаты) | Пароль для Basic Auth вебхуков |

### Прочее

| Переменная | Обязательна | Описание |
|-----------|-------------|----------|
| `CLEANUP_SECRET` | Опционально | Секрет для cron-задачи очистки |

## Настройка Supabase

### 1. Создание проекта

1. Зайти на [supabase.com/dashboard](https://supabase.com/dashboard)
2. Создать новый проект
3. Скопировать URL и ключи из Settings → API

### 2. Запуск миграций

Выполнить SQL-миграции из `/supabase/` в порядке:

1. `migration-001.sql` — таблицы jobs, rate_limits
2. `migration-002-auth.sql` — расширения авторизации
3. `migration-003-feedback.sql` — таблица feedback
4. `migration-004-payments.sql` — таблицы payments, user_access

### 3. Настройка Storage

Создать два бакета:
- `documents` (private) — загруженные пользователями файлы
- `results` (private) — обработанные документы

### 4. Настройка Auth

1. Settings → Authentication → URL Configuration
2. Указать Site URL и Redirect URLs (домен приложения)
3. Включить нужные OAuth-провайдеры (Google и др.)

## Деплой на Vercel

### 1. Подключение

```bash
vercel link
```

Или через GitHub-интеграцию (автодеплой при push).

### 2. Переменные окружения

Добавить все переменные через Vercel Dashboard → Settings → Environment Variables.

### 3. Деплой

```bash
vercel --prod
```

### Ограничения Vercel

| Параметр | Значение |
|----------|----------|
| Body size limit | 50 MB (настроено в `next.config.ts`) |
| Function timeout | 60 сек (Hobby: 10 сек, Pro: 60 сек) |
| Temp storage | `/tmp` (эфемерное, очищается между запросами) |

Для персистентного хранения файлов используется Supabase Storage.

## Cron-задачи

Настроены в `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cleanup",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Ежедневно в 3:00 UTC:
- Удаление старых временных файлов из Supabase Storage
- Очистка устаревших записей задач

## Кеширование (Cloudflare)

Настроено в `next.config.ts` через заголовки:

| Паттерн | Стратегия |
|---------|-----------|
| `_next/static/*` | 1 год, immutable |
| `*.woff2` | 1 год, immutable |
| Статические страницы | CDN кеширование (Cloudflare) |
| API-ответы | Без кеширования |

## Структура конфигурационных файлов

| Файл | Назначение |
|------|-----------|
| `next.config.ts` | Server Actions, cache headers, body limit |
| `vercel.json` | Cron-задачи |
| `tsconfig.json` | TypeScript (strict, path alias `@/*` → `src/*`) |
| `postcss.config.mjs` | PostCSS + Tailwind |
| `components.json` | shadcn/ui (style: new-york, icons: lucide) |
| `.env.example` | Шаблон переменных окружения |
