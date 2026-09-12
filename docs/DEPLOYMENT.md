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
5. `migration-005-rate-limits-rls.sql` — RLS для rate_limits
6. `migration-006-jobs-has-full-version.sql` — поле has_full_version для hook-offer
7. `migration-007-payments-unlock-job-id.sql` — поле unlock_job_id для hook-offer

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

Очистку `/api/cleanup` запускают два независимых триггера — она идемпотентна,
двойной запуск безвреден.

**1. crontab на Timeweb** (основной, перенесён с Vercel 2026-06-29). Дёргает
`GET /api/cleanup?secret=$CLEANUP_SECRET`. Расписание и живость проверяются
на самом сервере — из репозитория это не видно.

**2. Vercel Cron** (подстраховка) — в `vercel.json`:

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

Раз в сутки в 3:00 UTC (Hobby-тариф разрешает не чаще одного раза в день).
Vercel шлёт `Authorization: Bearer $CRON_SECRET` — переменную нужно завести
в настройках проекта, иначе роут ответит 401 (при заданном `CLEANUP_SECRET`).

Что делает очистка:
- удаляет старые временные файлы из Supabase Storage (48 ч; купленные полные
  версии `_full.docx` — 30 дней);
- чистит устаревшие записи задач и retention-таблицы;
- сбрасывает зависшие задачи.

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
