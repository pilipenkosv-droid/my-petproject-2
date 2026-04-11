# ADR-003: Ротация AI-моделей и подключение AITUNNEL

**Дата:** 2026-04-11
**Статус:** Принято
**Контекст:** CSAT 2.1/5, 80% трафика на слабой 8B модели, 5 из 8 моделей мертвы

## Проблема

AI Gateway использовал 8 моделей, из которых:
- 5 полностью мертвы (0% success): OpenRouter Llama 8B (404), OpenRouter Gemma 9B, Anthropic Haiku ($0 баланс), Gemini Flash (503), Cerebras GPT-OSS 120B
- 2 почти мертвы: Groq Llama 70B (8% success, TPD лимит 100K), OpenRouter GPT-OSS 120B (12%)
- 80% нагрузки падало на Cerebras Llama 3.1 8B — слабая модель, дающая плохое качество

Дополнительные проблемы:
- Timeout cascade: 5 моделей × 30с = 150с > Vercel maxDuration 60с → таймауты
- Бесплатные провайдеры ненадёжны (rate limits, удаление моделей, 503)

## Решение

### 1. Гибридная модель: бесплатные + платный агрегатор

Подключен [AITUNNEL](https://aitunnel.ru/) — российский OpenAI-compatible API агрегатор:
- Endpoint: `https://api.aitunnel.ru/v1/`
- Оплата в рублях, без VPN
- Минимальный депозит 399₽
- Стоимость: Gemini Flash Lite ~19₽/1M input, Llama 70B ~23₽/1M input

### 2. Новая ротация (5 моделей)

| Priority | ID | Провайдер | Модель | Тип | Стоимость |
|----------|----|-----------|--------|-----|-----------|
| 1 | gemini-2.5-flash-lite | Google (прямой) | Gemini 2.5 Flash Lite | бесплатный | $0, лимит 20 RPD |
| 2 | aitunnel-gemini-flash-lite | AITUNNEL | Gemini 2.5 Flash Lite | платный | ~19₽/1M input |
| 3 | cerebras-qwen-3-235b | Cerebras | Qwen 3 235B | бесплатный | $0, лимит 200 RPD |
| 4 | aitunnel-llama-3.3-70b | AITUNNEL | Llama 3.3 70B | платный | ~23₽/1M input |
| 10 | cerebras-llama-3.1-8b | Cerebras | Llama 3.1 8B | аварийный | $0, слабая модель |

### 3. Защита от таймаутов

- Таймаут на модель: 10с (платные) / 12с (бесплатные)
- Максимум 4 попытки за запрос (MAX_MODEL_ATTEMPTS)
- Worst case: 4 × 12с = 48с < 60с Vercel maxDuration

### 4. Удалённые модели

| Модель | Причина удаления |
|--------|-----------------|
| openrouter-gpt-oss-120b | 12% success, 52 consecutive errors |
| groq-llama-3.3-70b | 8% success, TPD 100K выбивается к обеду |
| openrouter-llama-3.1-8b | 404, удалена из free tier |
| openrouter-gemma-2-9b | 0% success |
| anthropic-claude-haiku | Баланс $0 |
| gemini-2.5-flash | 503 UNAVAILABLE |
| cerebras-gpt-oss-120b | 0% success в production |
| groq-llama-3.1-8b | Заменена на AITUNNEL Llama 70B |

## Стоимость

При текущем трафике (~100 AI-запросов/день, ~10K токенов/запрос):
- Бесплатные модели покроют ~220 запросов/день (20 Gemini + 200 Cerebras)
- AITUNNEL используется только при исчерпании бесплатных лимитов
- Расход AITUNNEL: ~20-50₽/день → ~600-1500₽/мес
- Баланс 1150₽ хватит на 3-4 недели

## Альтернативы рассмотренные

| Вариант | Почему отклонён |
|---------|----------------|
| Только бесплатные | Ненадёжно — лимиты, удаление моделей, 503 |
| Google Gemini платный напрямую | Нужен биллинг Google Cloud, сложнее настройка |
| ProxyAPI.ru | Дороже AITUNNEL (26₽ vs 19₽ за Gemini Flash Lite) |
| VseGPT.ru | Непрозрачные цены, меньше документации |
| Vercel AI Gateway | Не решает проблему оплаты из РФ |

## Мониторинг

```sql
-- Успешность моделей за сегодня
SELECT model_id, successful_requests, failed_requests,
       ROUND(successful_requests * 100.0 / NULLIF(successful_requests + failed_requests, 0)) as pct
FROM ai_usage_daily WHERE date = CURRENT_DATE ORDER BY model_id;

-- Блокировки моделей
SELECT model_id, consecutive_errors, blocked_until,
       CASE WHEN blocked_until > EXTRACT(EPOCH FROM NOW()) * 1000 THEN 'BLOCKED' ELSE 'OK' END
FROM rate_limits ORDER BY model_id;

-- Баланс AITUNNEL (в ответе API, поле usage.balance)
-- Или в личном кабинете: https://aitunnel.ru/
```

## Файлы

| Файл | Роль |
|------|------|
| `src/lib/ai/model-registry.ts` | Реестр моделей с приоритетами и лимитами |
| `src/lib/ai/gateway.ts` | Маршрутизация запросов, fallback, таймауты |
| `src/lib/ai/rate-limiter.ts` | RPM/RPD лимиты, блокировка после ошибок |
| `src/lib/ai/block-markup-prompts.ts` | Few-shot промпты для разметки блоков |
| `src/lib/ai/document-block-markup.ts` | Разметка + post-validation (rule-based) |

## Последствия

- **Положительные:** надёжность 93%+ (vs ~50% до), качество выше (70B-235B vs 8B), предсказуемая стоимость
- **Отрицательные:** появляется расход ~600-1500₽/мес на AITUNNEL
- **Риски:** зависимость от AITUNNEL (митигация: Cerebras как бесплатный fallback)
