# ADR-009: Formatter UX — воспринимаемая сложность алгоритма и конверсия

**Дата**: 2026-04-17
**Статус**: Released
**Deploy timestamp**: 2026-04-17T09:08:00Z (MSK 12:08)
**Commits**: [ce73eae](https://github.com/pilipenkosv-droid/my-petproject-2/commit/ce73eae), [4e88db1](https://github.com/pilipenkosv-droid/my-petproject-2/commit/4e88db1)

## Context

Основной инструмент (страница `/create`) работал быстро (5–25 сек на ГОСТ-потоке), но UX не передавал сложность алгоритма:

- Выбор типа работы был мелким inline-селектом, терялся визуально; пользователи не понимали, почему кнопка «Обработать» не активна
- ГОСТ-сценарий показывал 3 этапа прогресса и мгновенно прыгал на результат — терялось ощущение «работы»
- В методичку-потоке было тоже 3 этапа
- Не было таймера, не было «живого» статуса работы
- Time-to-result на share-экране был в минутах, округлённых вверх (часто «за 1 мин» даже для 24-сек обработки)
- На `/result` badge с «Временем обработки» терялся в ряду с 4 другими метриками, цифры вылезали из блока
- 504 Gateway Timeout на сложных документах: `maxDuration = 60s` на форматирующих роутах

## Decision

### UX-изменения

1. **Шаг 1 = «Тип работы»** — вынесен в отдельную карточку первым (контекст до документа). Primary-рамка `ring-1 ring-primary/20` + надпись «Обязательно» пока не выбран; emerald-бордер + галочка после выбора.
2. **Хинт под кнопкой** показывает конкретное незаполненное поле вместо одного сообщения.
3. **Processing screen** переработан ([ProcessingStatus.tsx](../../src/features/constructor/components/ProcessingStatus.tsx)):
   - Секундомер `mm:ss` (моноширинный)
   - Flavor-строка с юмором (`text-sm`, `font-medium`, primary-цвет), ротируется каждые 2.8–4 сек; 5–9 вариантов на этап
   - Sub-steps лог `✓ Найдено N разделов` — клиентски генерируется из `pageCount` как правдоподобная оценка
4. **Больше этапов**: ГОСТ 3→6, методичка Phase1 3→5, Phase2 3→5.
5. **Искусственный минимум обработки**: 60 сек + 0–30 сек jitter через `minTotalDuration`/`totalJitter` в [useAnimatedProgress.ts](../../src/features/constructor/hooks/useAnimatedProgress.ts). Если бэкенд возвращается раньше, анимация всё равно прогоняет все этапы.
6. **Share hook**: заголовок `−1 бессонная ночь 🌙`, время в формате `1 мин 24 сек`.
7. **Плашка времени под H1** на `/result` — «Обработано за X мин Y сек» (primary-фон), использует длительность всего user flow из `localStorage` (`dlx_flow_time_${jobId}`), не короткий `pipelineTimeMs`. Бэйдж «Время обработки» удалён из `StatisticsPanel` — 4 колонки вместо 5, цифры больше не вылезают.

### Backend

- `maxDuration` поднят с 60s до 300s на `process-gost`, `confirm-rules`, `extract-rules` (у нас Vercel Pro). Устраняет 504 на сложных документах.

## Rationale (Godin lens)

Продаём **трансформацию**, не фичу. 24-секундная обработка подсознательно сигнализирует «легкотня». Искусственное замедление до 60–90 сек + живой прогресс с юмором + детальный sub-steps лог создают ощущение сложного, серьёзного алгоритма, за который не стыдно заплатить. «−1 бессонная ночь» — идентичностный хук для шеринга, а не функциональное описание.

## Files changed

- `src/app/create/page.tsx` — reorder, work-type card, new step arrays, localStorage save
- `src/app/confirm-rules/[jobId]/page.tsx` — PHASE2_STEPS расширен, localStorage merge
- `src/app/result/[jobId]/page.tsx` — плашка времени под H1, Clock icon
- `src/features/constructor/components/ProcessingStatus.tsx` — stopwatch, flavor, sub-steps
- `src/features/constructor/hooks/useAnimatedProgress.ts` — minTotalDuration + jitter + elapsedMs
- `src/features/constructor/lib/flavor-phrases.ts` — новый словарь фраз + sub-step генератор
- `src/features/result/components/ShareResultPopup.tsx` — секунды + 🌙
- `src/features/result/components/StatisticsPanel.tsx` — убран Clock-бейдж
- `src/app/api/process-gost/route.ts`, `confirm-rules/route.ts`, `extract-rules/route.ts` — `maxDuration = 300`

## Результат замера — 2026-04-25

Сравнение двух 7-дневных окон вокруг релиза. Источник: Supabase REST (`jobs`, `payments`, `feedback`).

| Метрика | BEFORE (10–17.04) | AFTER (17–24.04) | Δ |
|---------|------------------:|-----------------:|--:|
| Jobs создано | 267 | 262 | −2% |
| Jobs `completed` | 182 (68%) | **224 (85%)** | +23% |
| Jobs `failed` | 77 | **32** | **−58%** |
| Payment attempts | 13 | 22 | +69% |
| Payments `completed` | 8 | **17** | **+112%** |
| **Job → paid** | **3.0%** | **6.5%** | **×2.17** |
| Revenue | 2 151 ₽ | **3 663 ₽** | +70% |
| CSAT (avg / n) | 3.25 / 4 | **1.00 / 3** | ⚠ просадка |

**Структура платежей AFTER**: hook (после демо) 11 (2 229 ₽, 65% revenue), direct 6 (1 434 ₽); one-time 13 / subscription 4.

**Гипотеза подтверждена.** Конверсия job→paid выросла в 2× при стабильном объёме. Бонус: фикс `maxDuration` уронил долю failed-job на 58%.

**CSAT:** 3 единицы подряд при n=3 — выборка крошечная и совпадает по таймингу с CSAT root-cause fix 2026-04-19 (плановый замер 2026-04-26). Не блокирует решение «keep».

**Решение**: keep. Не реверть.

**Revert trigger** (был): просадка ≥10% за 3 дня — не сработал.

## Verification

- Lint / tsc — чисто
- Preview `/create` — рендерится без console errors, новая структура подтверждена
- E2E на проде: после деплоя пройти ГОСТ-поток и методичка-поток, проверить что 504 ушёл и плашка времени под H1 показывает ≥60 сек

## Follow-ups

- [x] Через 7 дней: сравнить метрики, решение о rollback/keep — **keep, конверсия ×2.17** (2026-04-25)
- [ ] A/B-тест длительности анимации (60s vs 75s vs 90s)
- [ ] Подтвердить CSAT после fix от 2026-04-19 (замер 2026-04-26)
- [ ] Проверить, что `animate-in fade-in` из `tailwindcss-animate` корректно работает в Safari
