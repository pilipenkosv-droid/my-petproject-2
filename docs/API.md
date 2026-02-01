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
  "error": null,
  "createdAt": "2026-01-30T12:00:00Z",
  "updatedAt": "2026-01-30T12:01:00Z"
}
```

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
  "offerType": "one_time" | "subscription"
}
```

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

## Авторизация (OAuth)

### GET /auth/callback

Callback для Supabase OAuth. Обменивает authorization code на сессию.

**Query params:**
- `code` — код авторизации от Supabase
- `next` — URL для редиректа после входа (default: `/create`)

**Response:** HTTP Redirect → `next` или `/login?error=auth_failed`
