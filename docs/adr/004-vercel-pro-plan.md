# ADR-004: Переход на Vercel Pro

## Дата
2026-04-11

## Контекст

На Hobby-плане Vercel serverless functions имели жёсткий лимит **10 секунд** timeout.
При этом в коде все AI-эндпоинты и cron-задачи объявляли `maxDuration = 30–60`, что **игнорировалось** Vercel — функции обрезались на 10 сек.

Затронутые маршруты:
- `/api/process`, `/api/process-gost`, `/api/confirm-rules`, `/api/extract-rules` — 60 сек
- `/api/check-grammar`, `/api/find-sources`, `/api/payment/webhook` — 60 сек
- `/api/rewrite`, `/api/summarize`, `/api/generate-outline`, `/api/ask-guidelines` — 30 сек
- Все `/api/cron/*` — 30–60 сек

Cron jobs на Hobby: только 1 в день. У нас 7 регулярных cron-задач.

## Решение

Переход на **Vercel Pro** ($20/мес).

## Что используем из Pro

### Автоматически работает
| Возможность | Hobby | Pro | Статус |
|-------------|-------|-----|--------|
| Serverless timeout | 10 сек | **60 сек** | Все routes работают с заявленным maxDuration |
| Cron jobs | 2 | **40** | Все 7 cron-задач работают по расписанию |
| Bandwidth | 100 GB/мес | **1 TB/мес** | Запас на рост |
| Image Optimization | 1000/мес | **5000/мес** | Запас |
| Serverless execution | 100 GB-hrs | **1000 GB-hrs** | Запас для AI-нагрузки |
| Concurrent builds | 1 | 1 (до 12) | Достаточно |

### Настроено в коде
| Возможность | Как подключено |
|-------------|---------------|
| **Vercel Analytics** | `@vercel/analytics` — `<Analytics />` в `layout.tsx` |

### Настраивается в Dashboard
| Возможность | Где | Рекомендация |
|-------------|-----|-------------|
| **Deployment Protection** | Project Settings → Deployment Protection | Vercel Authentication для Preview |
| **Skew Protection** | Project Settings → Advanced → Skew Protection | 24 hours |
| **Spending Alerts** | Team Settings → Billing → Spend Management | On-Demand Budget $5 |

### Не используем (платные add-ons)
- **Speed Insights** ($10/мес + $0.65/10K points) — Web Vitals доступны в бесплатном Analytics
- **Web Analytics Plus** ($10/мес) — базовая Analytics достаточна
- **Advanced Deployment Protection** ($150/мес) — не нужно
- **Observability Plus** ($1.20/1M events) — пока не нужно
- **Feature Flags** ($0.03/1K requests) — мало трафика для A/B тестов

### Не используем (не нужно сейчас)
- Password Protection — B2C, нет смысла
- Firewall Rules — трафик небольшой
- Log Drains — пока не нужны внешние логи
- Web Analytics dashboard — есть GA4

## Аналитика (текущий стек)

| Инструмент | Статус | Назначение |
|------------|--------|-----------|
| Google Analytics 4 | Работает | Основная аналитика, конверсии, поведение |
| Vercel Analytics | Работает | Page views, базовые web vitals |
| Яндекс.Метрика | Удалена (2026-04-11) | Не нужна: GA4 + Vercel Analytics покрывают всё |

## Последствия

- Все AI-эндпоинты стабильно работают с полным timeout
- Payment webhook (`/api/payment/webhook`) не теряет платежи из-за timeout
- Cron-задачи (email-рассылки, reconcile-payments) выполняются полностью
- Real User Metrics (Speed Insights) помогают отслеживать Core Web Vitals для SEO
- $20/мес — фиксированная стоимость, spending alerts защитят от перерасхода
