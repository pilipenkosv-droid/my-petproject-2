# Справочник API

Все эндпоинты расположены в `src/app/api/`.

## Обработка документов

### POST /api/extract-rules

Первый этап: загрузка файлов и извлечение правил форматирования из методички.

**Авторизация:** Да (проверка доступа через `checkProcessingAccess`)

**Request:** `multipart/form-data`

| Поле | Тип | Описание |
|------|-----|----------|
| sourceDocument | File | Исходный документ (.docx) |
| requirementsDocument | File | Методичка (.docx, .pdf, .txt) |

**Response:** `200 OK`
```json
{
  "jobId": "abc123",
  "status": "awaiting_confirmation",
  "rules": { /* FormattingRules */ },
  "confidence": 0.92,
  "warnings": ["..."],
  "missingRules": ["..."]
}
```

---

### POST /api/confirm-rules

Второй этап: подтверждение правил и запуск обработки.

**Авторизация:** Нет (нужен валидный jobId)

**Request:** `application/json`
```json
{
  "jobId": "abc123",
  "rules": { /* FormattingRules, опционально */ }
}
```

**Response:** `200 OK`
```json
{
  "jobId": "abc123",
  "status": "completed",
  "statistics": { /* DocumentStatistics */ },
  "violationsCount": 42
}
```

---

### POST /api/process

Объединённый эндпоинт: извлечение правил + обработка в одном запросе (без подтверждения).

**Авторизация:** Да (проверка квоты; анонимные — 1 бесплатная через cookies)

**Request:** `multipart/form-data`

| Поле | Тип | Описание |
|------|-----|----------|
| sourceDocument | File | Исходный документ (.docx) |
| requirementsDocument | File | Методичка (.docx, .pdf, .txt) |

**Response:** `200 OK`
```json
{
  "jobId": "abc123",
  "status": "completed",
  "statistics": { /* DocumentStatistics */ },
  "violationsCount": 42,
  "warnings": ["..."]
}
```

---

### GET /api/status/[jobId]

Получение статуса задачи (для polling).

**Авторизация:** Нет

**Response:** `200 OK`
```json
{
  "id": "abc123",
  "status": "processing",
  "progress": 65,
  "statusMessage": "Форматирование документа...",
  "rules": { /* только если status === "awaiting_confirmation" */ },
  "statistics": { /* если completed */ },
  "violationsCount": 42,
  "hasFullVersion": true,
  "error": null,
  "createdAt": "2026-01-30T12:00:00Z",
  "updatedAt": "2026-01-30T12:01:00Z"
}
```

**Поле `hasFullVersion`:** Флаг наличия полной версии документа для разблокировки (hook-offer). Если `true` — пользователь может разблокировать полную версию после оплаты.

---

### GET /api/preview/[jobId]/[type]

HTML-превью документа для двойного просмотра.

**Авторизация:** Нет

**Параметры пути:**
- `jobId` — ID задачи
- `type` — `original` (с пометками нарушений) или `formatted` (после форматирования)

**Response:** `200 OK`
```json
{
  "html": "<div>...</div>",
  "warnings": ["..."]
}
```

---

### GET /api/download/[fileId]

Скачивание DOCX-файла.

**Авторизация:** Нет

**Параметры пути:**
- `fileId` — формат: `{jobId}_original` или `{jobId}_formatted`

**Response:** Binary DOCX
- `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `Content-Disposition: attachment; filename="document_*.docx"`

---

## Оплата

### POST /api/payment/create

Создание платёжного инвойса.

**Авторизация:** Да (требуется авторизованный пользователь)

**Request:** `application/json`
```json
{
  "offerType": "one_time" | "subscription",
  "unlockJobId": "abc123"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| offerType | string | Тип тарифа: `one_time` или `subscription` |
| unlockJobId | string? | Опционально: ID задачи для разблокировки полной версии (hook-offer) |

**Response:** `200 OK`
```json
{
  "paymentUrl": "https://pay.lava.top/...",
  "invoiceId": "inv_123"
}
```

---

### GET /api/payment/check/[invoiceId]

Проверка статуса конкретного платежа.

**Авторизация:** Да

**Response:** `200 OK`
```json
{
  "status": "pending" | "completed" | "failed",
  "offerType": "one_time" | "subscription"
}
```

---

### GET /api/payment/status

Текущий статус доступа пользователя.

**Авторизация:** Да

**Response:** `200 OK`
```json
{
  "accessType": "subscription",
  "hasAccess": true,
  "usesRemaining": 8,
  "subscriptionActiveUntil": "2026-03-01T00:00:00Z"
}
```

---

### POST /api/payment/verify

Пакетная проверка всех pending-платежей пользователя.

**Авторизация:** Да

**Response:** `200 OK`
```json
{
  "verified": 1,
  "message": "Найден и подтверждён 1 платёж"
}
```

---

### POST /api/payment/webhook

Webhook от Lava.top для обновления статуса платежей.

**Авторизация:** Basic Auth (логин/пароль из env)

**Events:**
- `payment.success` — успешная оплата
- `payment.failed` — неудачная оплата
- `subscription.recurring.payment.success` — продление подписки
- `subscription.cancelled` — отмена подписки

**Hook-Offer:** При `payment.success`, если в платеже указан `unlock_job_id`:
- Разблокируются полные версии документов (копирование `*_full.docx` → `*.docx`)
- Флаг `has_full_version` сбрасывается в `false`

**Response:** `200 OK`
```json
{ "ok": true }
```

---

## Пользователь

### GET /api/user/access

Информация о доступе текущего пользователя.

**Авторизация:** Да (401 если не авторизован)

**Response:** `200 OK`
```json
{
  "accessType": "trial" | "one_time" | "subscription" | "none",
  "hasAccess": true,
  "remainingUses": 1,
  "subscriptionActiveUntil": null
}
```

---

## Утилиты

### POST /api/feedback

CSAT-отзыв на результат обработки.

**Авторизация:** Опционально (Bearer token)

**Request:** `application/json`
```json
{
  "jobId": "abc123",
  "rating": 4,
  "feedback": "Комментарий (опционально)"
}
```

**Response:** `200 OK`
```json
{ "success": true }
```

---

### GET /api/cleanup

Очистка старых файлов и задач. Вызывается cron-задачей Vercel (ежедневно в 3:00 UTC).

**Авторизация:** Опционально (query param `secret`)

**Response:** `200 OK`
```json
{
  "success": true,
  "deletedJobs": 5,
  "deletedFiles": 12
}
```

---

## Инструменты

### POST /api/generate-outline

Генерация плана (структуры) научной работы с помощью AI.

**Авторизация:** Нет (бесплатный инструмент)

**Request:** `application/json`
```json
{
  "topic": "Анализ финансовой устойчивости предприятия",
  "workType": "Курсовая работа",
  "subject": "Финансовый менеджмент",
  "additionalRequirements": "Включить анализ за 2020-2024 гг."
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| topic | string | Тема работы (5-500 символов) |
| workType | string | Тип работы (label из WORK_TYPES) |
| subject | string? | Название предмета |
| additionalRequirements | string? | Дополнительные требования |

**Response:** `200 OK`
```json
{
  "outline": "ВВЕДЕНИЕ\n\n1. ТЕОРЕТИЧЕСКИЕ ОСНОВЫ..."
}
```

**Таймаут:** 30 секунд

---

### POST /api/check-grammar

Проверка текста на грамматические, орфографические и пунктуационные ошибки через LanguageTool API.

**Авторизация:** Нет

**Request:** `application/json`
```json
{
  "text": "Текст для проверки...",
  "language": "ru-RU"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| text | string | Текст (10-100 000 символов) |
| language | string? | Язык (default: `ru-RU`) |

**Response:** `200 OK` — объект с ошибками от LanguageTool (matches, language info)

**Ошибки:** 429 при превышении лимита LanguageTool API

**Таймаут:** 60 секунд

---

### POST /api/rewrite

Перефразирование текста для повышения уникальности с помощью AI.

**Авторизация:** Нет

**Request:** `application/json`
```json
{
  "text": "Исходный текст для рерайта...",
  "mode": "medium",
  "preserveTerms": "ГОСТ, SmartFormat"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| text | string | Текст (50-50 000 символов) |
| mode | string? | `light` / `medium` (default) / `heavy` |
| preserveTerms | string? | Термины через запятую, которые не менять |

**Response:** `200 OK`
```json
{
  "rewritten": "Перефразированный текст..."
}
```

**Таймаут:** 30 секунд

---

### POST /api/summarize

Генерация краткого содержания (аннотации) текста с помощью AI.

**Авторизация:** Нет

**Request:** `application/json`
```json
{
  "text": "Полный текст работы...",
  "targetLength": "medium"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| text | string | Текст (50-50 000 символов) |
| targetLength | string? | `short` (100-200 слов) / `medium` (300-500, default) / `detailed` (800-1000) |

**Response:** `200 OK`
```json
{
  "summary": "Краткое содержание..."
}
```

**Таймаут:** 30 секунд

---

### POST /api/find-sources

Поиск научных источников через OpenAlex и CrossRef с AI-валидацией релевантности.

**Авторизация:** Нет

**Request:** `application/json`
```json
{
  "topic": "Финансовая устойчивость предприятия",
  "workType": "kursovaya",
  "count": 10
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| topic | string | Тема (5-500 символов) |
| workType | string | Slug типа работы |
| count | number? | 5 / 10 (default) / 15 / 20 |

**Response:** `200 OK`
```json
{
  "sources": [
    {
      "id": "src_1",
      "raw": {
        "title": "...",
        "authors": ["..."],
        "year": 2023,
        "doi": "10.1234/...",
        "journal": "...",
        "type": "journal-article",
        "url": "...",
        "source": "openalex"
      },
      "formatted": "Иванов И.И. Название статьи // Журнал. — 2023.",
      "relevant": true,
      "relevanceNote": "Релевантен теме..."
    }
  ],
  "totalFound": 15,
  "apis": { "openalex": 10, "crossref": 5 }
}
```

**Таймаут:** 60 секунд

---

### POST /api/extract-text

Извлечение текста из загруженного документа (.docx, .pdf, .txt).

**Авторизация:** Нет

**Request:** `multipart/form-data`

| Поле | Тип | Описание |
|------|-----|----------|
| file | File | Документ (.docx, .pdf, .txt), макс. 10 МБ |

**Response:** `200 OK`
```json
{
  "text": "Извлечённый текст...",
  "charCount": 15420
}
```

**Таймаут:** 15 секунд

---

## Авторизация (OAuth)

### GET /auth/callback

Callback для Supabase OAuth. Обменивает authorization code на сессию.

**Query params:**
- `code` — код авторизации от Supabase
- `next` — URL для редиректа после входа (default: `/create`)

**Response:** HTTP Redirect → `next` или `/login?error=auth_failed`
