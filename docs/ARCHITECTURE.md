# Архитектура SmartFormat

## Общая схема

```
Пользователь
    │
    ├─ Загрузка документа + методичка
    │       ↓
    ├─ [extract-rules] AI извлекает правила из методички
    │       ↓
    ├─ Пользователь подтверждает/редактирует правила
    │       ↓
    ├─ [confirm-rules] Анализ + форматирование документа
    │       ↓
    └─ Просмотр результата (оригинал vs отформатированный)
        └─ Скачивание DOCX
```

## Пайплайн обработки документа

### Этап 1: Извлечение правил (`/api/extract-rules`)

1. Загрузка двух файлов (source DOCX + requirements DOCX/PDF/TXT)
2. Извлечение текста из requirements через `text-extractor.ts`
3. AI-анализ текста для извлечения правил форматирования (`prompts.ts` + `gateway.ts`)
4. Валидация через Zod-схемы (`schemas.ts`)
5. Сохранение правил в job, статус → `awaiting_confirmation`

### Этап 2: Подтверждение и обработка (`/api/confirm-rules`)

1. Пользователь подтверждает или редактирует правила
2. **Семантический анализ** документа через AI (`document-semantic-parser.ts`):
   - Определение типов секций (введение, главы, заключение, библиография)
   - Распознавание иерархии заголовков (уровни 1-4)
   - Детальный анализ списка литературы
3. **Анализ документа** (`document-analyzer.ts`):
   - Проверка каждого параграфа на соответствие правилам
   - Генерация списка нарушений с привязкой к параграфам
   - Подсчёт статистики (символы, страницы, compliance %)
4. **Форматирование** (`document-formatter.ts` + `xml-formatter.ts`):
   - Применение правил на уровне DOCX XML
   - Специальная обработка библиографии (`bibliography-xml-formatter.ts`)
   - Вставка комментариев с описанием нарушений
5. Сохранение двух файлов: marked original + formatted
6. Статус → `completed`

### Альтернативный путь: всё в одном (`/api/process`)

Объединяет этапы 1 и 2 в один запрос (без промежуточного подтверждения правил).

## Инструменты (Tools)

Помимо основного пайплайна форматирования, сервис включает 5 самостоятельных AI-инструментов:

```
/outline    → [AI Gateway]     → Генерация плана работы
/grammar    → [LanguageTool]   → Проверка грамматики/орфографии
/rewrite    → [AI Gateway]     → Рерайт для повышения уникальности
/summarize  → [AI Gateway]     → Краткое содержание / аннотация
/sources    → [OpenAlex + CrossRef + AI Gateway] → Подбор литературы
```

### Генератор плана (`/outline`)
- **API:** `POST /api/generate-outline`
- **Вход:** тема, тип работы, предмет (опц.), доп. требования (опц.)
- **AI:** генерирует структуру с разделами, подразделами, рекомендуемым объёмом
- **Cross-sell:** после генерации → ссылка на подбор литературы и форматирование

### Проверка грамматики (`/grammar`)
- **API:** `POST /api/check-grammar`
- **Интеграция:** LanguageTool API (public, `api.languagetool.org/v2/check`)
- **Типы ошибок:** орфография, пунктуация, грамматика, стиль, типографика
- **Ввод:** текст напрямую или загрузка файла (через `/api/extract-text`)

### Повышение уникальности (`/rewrite`)
- **API:** `POST /api/rewrite`
- **AI:** 3 режима — light (синонимы), medium (перестройка), heavy (полное перефразирование)
- **Фича:** сохранение терминов (preserveTerms) — указанные слова не заменяются

### Краткое содержание (`/summarize`)
- **API:** `POST /api/summarize`
- **AI:** 3 длины — short (100-200 слов), medium (300-500), detailed (800-1000)
- **Ввод:** текст или файл (через `/api/extract-text`)

### Подбор литературы (`/sources`)
- **API:** `POST /api/find-sources`
- **Источники данных:** OpenAlex API + CrossRef API (оба бесплатные)
- **AI-валидация:** проверка релевантности каждого источника через AI Gateway
- **Выход:** форматированный список по ГОСТ Р 7.0.5-2008

### Извлечение текста (`/api/extract-text`)
- Утилита для grammar и summarize — извлекает текст из .docx/.pdf/.txt
- Используется когда пользователь загружает файл вместо вставки текста

### Cross-sell архитектура

```
Каждая страница инструмента
    ├── RelatedTools (src/components/RelatedTools.tsx) — grid ссылок на 5 других инструментов
    └── CTA → /create (форматирование)

Landing page
    └── Секция «Все инструменты» — grid 2x3

WorkTypeLanding (/diplom, /kursovaya, ...)
    └── Секция «Полезные инструменты» — 4 карточки

Blog CTA
    └── Pill-ссылки на инструменты
```

## AI-шлюз (Multi-Provider Gateway)

**Файл:** `src/lib/ai/gateway.ts`

Шлюз автоматически выбирает доступную модель из нескольких провайдеров с фоллбэком:

```
Запрос → [Rate Limiter] → Gemini → Groq → OpenRouter → Cerebras → OpenAI → Claude
                              ↓         ↓
                          если 429   если ошибка
                          → следующий провайдер
```

### Провайдеры и модели

| Провайдер | Модели | Лимиты |
|-----------|--------|--------|
| Gemini | gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro | 20 RPD на модель |
| Groq | llama-3.3-70b | 14400 RPD |
| OpenRouter | бесплатные модели (Llama, Gemma) | зависит от модели |
| Cerebras | llama-3.3-70b | 1000 RPD |
| OpenAI | gpt-4o, gpt-4o-mini | платный |
| Anthropic | claude-3.5-sonnet | платный |

### Rate Limiter

**Файл:** `src/lib/ai/rate-limiter.ts`

- Отслеживание RPM (requests per minute) и RPD (requests per day)
- Хранение счётчиков в Supabase (`rate_limits` таблица)
- Автоматический пропуск модели при исчерпании лимита

### Промпты

| Файл | Назначение |
|------|-----------|
| `prompts.ts` | Основные промпты: извлечение правил из методички |
| `semantic-prompts.ts` | Семантический анализ структуры документа |
| `block-markup-prompts.ts` | Разметка блоков документа |

## Схема базы данных (Supabase PostgreSQL)

### Таблица `jobs`

Хранение задач обработки документов.

| Поле | Тип | Описание |
|------|-----|----------|
| id | TEXT PK | ID задачи (nanoid) |
| status | TEXT | pending / uploading / extracting / awaiting_confirmation / processing / completed / failed |
| progress | INTEGER | 0-100 |
| status_message | TEXT | Описание текущего этапа |
| source_document_id | TEXT | ID исходного файла в Storage |
| requirements_document_id | TEXT | ID файла требований |
| source_original_name | TEXT | Имя загруженного файла |
| marked_original_id | TEXT | ID файла с пометками нарушений |
| formatted_document_id | TEXT | ID отформатированного файла |
| has_full_version | BOOLEAN | Флаг наличия полной версии (для hook-offer) |
| rules | JSONB | Извлечённые правила форматирования |
| violations | JSONB | Массив найденных нарушений |
| statistics | JSONB | Статистика документа |
| error | TEXT | Сообщение об ошибке |
| user_id | UUID | FK → auth.users (nullable для анонимных) |
| created_at | TIMESTAMPTZ | Время создания |
| updated_at | TIMESTAMPTZ | Время обновления |

### Таблица `user_access`

Управление доступом пользователей.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | UUID UNIQUE | FK → auth.users |
| access_type | TEXT | one_time / subscription |
| remaining_uses | INTEGER | Оставшееся кол-во обработок |
| subscription_active_until | TIMESTAMPTZ | Срок подписки |
| lava_subscription_id | TEXT | ID подписки в Lava.top |

### Таблица `payments`

История платежей.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| user_id | UUID | FK → auth.users |
| lava_invoice_id | TEXT | ID счёта в Lava.top |
| offer_type | TEXT | one_time / subscription |
| amount | DECIMAL | Сумма |
| currency | TEXT | RUB |
| status | TEXT | pending / completed / failed |
| unlock_job_id | TEXT | ID задачи для разблокировки полной версии (hook-offer) |

### Таблица `feedback`

CSAT-отзывы пользователей.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID PK | |
| job_id | TEXT | ID задачи |
| user_id | UUID | Nullable |
| rating | INTEGER | 1-5 |
| comment | TEXT | Комментарий (при оценке <= 3) |

### Таблица `rate_limits`

Отслеживание лимитов AI-моделей.

| Поле | Тип | Описание |
|------|-----|----------|
| model_id | TEXT PK | Идентификатор модели |
| minute_requests | INTEGER | Запросов в текущей минуте |
| day_requests | INTEGER | Запросов за день |

**Row Level Security (RLS):** Таблица защищена RLS с политикой доступа только для service_role. Пользователи не имеют прямого доступа к rate_limits.

### Supabase Storage

| Бакет | Доступ | Содержимое |
|-------|--------|------------|
| documents | private | Загруженные пользователями файлы |
| results | private | Обработанные документы (+ полные версии для hook-offer: `*_full.docx`) |

## Hook-Offer для trial пользователей

При обработке документа trial-пользователем с документом >30 страниц:

1. Документ форматируется полностью (все страницы)
2. Полные версии сохраняются в Storage (`{jobId}/original_full.docx`, `{jobId}/formatted_full.docx`)
3. Результаты обрезаются до 30 страниц для скачивания
4. Устанавливается флаг `has_full_version = true` в таблице `jobs`
5. На странице результата показывается предложение купить тариф
6. При оплате передаётся `unlock_job_id` в payment
7. После успешной оплаты webhook разблокирует полные версии (копирует `*_full.docx` → `*.docx`)

## Аутентификация

- **Supabase Auth** с OAuth (Google и др.)
- Серверная валидация сессии через `createSupabaseServer()`
- Middleware (`middleware.ts`) для защиты маршрутов
- Поддержка анонимных пользователей (1 бесплатная обработка через триал)

## Система оплаты

**Провайдер:** Lava.top (российский платёжный сервис)

### Тарифы

| Тариф | Тип | Цена | Обработок |
|-------|-----|------|-----------|
| Пробный | trial | 0 ₽ | 1 |
| Разовая | one_time | 159 ₽ | 1 |
| Pro | subscription | 399 ₽/мес | 10 |

### Поток оплаты

1. Пользователь выбирает тариф → `POST /api/payment/create`
2. Создаётся инвойс в Lava.top, пользователь перенаправляется на оплату
3. После оплаты Lava.top шлёт webhook → `POST /api/payment/webhook`
4. Webhook активирует доступ через `activateAccess()`
5. Также есть ручная проверка → `POST /api/payment/verify` (для pending платежей)

## Обработка файлов

### Чтение форматов

| Формат | Модуль | Библиотека |
|--------|--------|------------|
| DOCX | `docx-reader.ts` | mammoth |
| PDF | `pdf-reader.ts` | pdf-parse |
| TXT | `txt-reader.ts` | fs (нативный) |

### XML-форматирование DOCX

Форматирование работает напрямую с XML-содержимым DOCX-файла (через JSZip + fast-xml-parser):

- `xml-formatter.ts` — основная логика: шрифты, размеры, отступы, интервалы, поля
- `bibliography-xml-formatter.ts` — специальные правила для библиографии
- `bibliography-formatter.ts` — неразрывные пробелы, кавычки, тире, нумерация

## Миграции БД

Файлы в `/supabase/`:

| Файл | Содержимое |
|------|-----------|
| migration-001.sql | jobs, rate_limits |
| migration-002-auth.sql | Расширения авторизации |
| migration-003-feedback.sql | feedback |
| migration-004-payments.sql | payments, user_access |
| migration-005-rate-limits-rls.sql | RLS для rate_limits |
| migration-006-jobs-has-full-version.sql | has_full_version для jobs |
| migration-007-payments-unlock-job-id.sql | unlock_job_id для payments |
