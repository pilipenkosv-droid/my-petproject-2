# CSAT Analytics — Аналитика удовлетворённости пользователей Diplox

## Когда использовать
Пользователь спрашивает про CSAT, удовлетворённость, отзывы, рейтинги, качество продукта, "как дела с отзывами", "что говорят пользователи".

## Источники данных

### Supabase: таблица `feedback`
```
feedback {
  id UUID, job_id TEXT, user_id UUID (nullable),
  rating SMALLINT (1-5), comment TEXT,
  source TEXT ('result_page' | 'after_download' | 'return_visit' | 'email'),
  work_type TEXT, requirements_mode TEXT,
  was_truncated BOOLEAN, created_at TIMESTAMPTZ
}
```

Запрос через PostgREST:
```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/feedback?select=*&order=created_at.desc&limit=50"
```

### Supabase: таблица `jobs` (для контекста)
```bash
# Completed jobs за период (для расчёта response rate)
curl -s -H "apikey: ..." -H "Authorization: Bearer ..." \
  -H "Prefer: count=exact" \
  "$URL/rest/v1/jobs?select=id&status=eq.completed&created_at=gte.2026-03-31" \
  -D - -o /dev/null 2>/dev/null | grep content-range
```

### Admin endpoint (агрегаты)
`GET /api/admin/analytics` — возвращает `csat.total_reviews`, `csat.avg_rating`, `csat.distribution`.

## Методология интерпретации

### Negative bias — ключевой фактор

**Мотив оставить отзыв несимметричен:**
- Недовольный пользователь: конверсия в отзыв ~15-30% (фрустрация, гнев)
- Довольный пользователь: конверсия в отзыв ~2-5% (обыденность)
- Нейтральный: ~1-2% (нет мотива)

**Следствие:** Средний CSAT при низком response rate ВСЕГДА смещён в сторону негатива. Цифра 2.1/5 НЕ означает, что 80% недовольны.

### Правильные метрики

| Метрика | Формула | Интерпретация |
|---------|---------|---------------|
| **Response rate** | отзывов / completed jobs | <5% = сильный bias, используй proxy-метрики |
| **Actionable negative rate** | негативных с комментарием / completed jobs | <2% = норма, >3% = проблема |
| **Реальная удовлетворённость** (estimate) | см. формулу ниже | Учитывает bias |
| **Конверсия как proxy** | рег → оплата, повторные покупки | Лучший сигнал при низком response rate |

### Формула оценки реальной удовлетворённости

```
Допущения:
- 20% недовольных оставляют отзыв (высокий мотив)
- 3% довольных оставляют отзыв (низкий мотив)
- 1% нейтральных оставляют отзыв

Из N отзывов:
- negative_reviews / 0.20 = estimated_negative_users
- positive_reviews / 0.03 = estimated_positive_users
- total_completed - estimated_negative - estimated_positive = estimated_neutral

real_satisfaction ≈ (estimated_positive + estimated_neutral * 0.7) / total_completed
```

### Пример расчёта (март 2026)
- 828 completed, 29 отзывов (3.5% response rate)
- 19 негативных → ~95 недовольных (11.5%)
- 5 позитивных → ~167 довольных (20%)
- ~566 нейтральных (68%) — продукт сработал, но без вау
- **Реальная удовлетворённость: ~60-65%**

### Фильтры для чистого CSAT

1. **Исключить was_truncated=true** — триальные пользователи ставят 1 из-за paywall, не из-за качества
2. **Исключить source='return_visit' без комментария** — низкое качество сигнала
3. **Исключить тестовые отзывы** (комментарии "тест деплоя" и т.п.)
4. **Фокус на after_download** — это самый чистый сигнал (пользователь реально скачал и оценил)

### Классификация негативных отзывов

При анализе комментариев категоризировать:

| Категория | Паттерны в комментариях | Приоритет |
|-----------|------------------------|-----------|
| **Качество форматирования** | "ничего не изменилось", "не по ГОСТу", "частично", "шрифт разный" | P0 — core value |
| **Баг рендеринга** | "чёрный фон", "столбики", "пустой" | P0 — bug |
| **Paywall frustration** | "платно", "только краткая версия" | P1 — фильтруется через was_truncated |
| **Unlock bug** | "оплатил, но не получил" | P0 — потеря доверия |
| **Специфичное** | "формулы", "таблицы", "переходы" | P1 — edge case |

### Периодичность

- **Еженедельно**: Проверять новые отзывы с комментариями (фокус на post-fix период)
- **Ежемесячно**: Полный расчёт реальной удовлетворённости, тренд actionable negative rate
- **При каждом релизе**: Мониторить CSAT первые 48 часов после деплоя

## Формат отчёта

```markdown
## CSAT Report — [период]

### Обзор
- Completed jobs: X
- Отзывов: Y (Z% response rate)
- Средний рейтинг: N/5 (⚠️ biased, см. реальную оценку)
- Estimated real satisfaction: ~X%

### Actionable negative rate
- Негативных с комментарием: N / X completed = Z%
- Тренд: [выше/ниже/стабильно] vs прошлая неделя

### Новые отзывы (с комментариями)
| Дата | Рейтинг | Комментарий | Категория | Action |
|------|---------|-------------|-----------|--------|
| ...  | ...     | ...         | ...       | ...    |

### Выводы и рекомендации
- ...
```
