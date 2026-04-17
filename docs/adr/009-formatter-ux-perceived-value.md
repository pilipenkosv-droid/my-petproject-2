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

## Baseline metrics — 2026-04-17 12:08 MSK

Замер «до» (окно 2026-04-10 — 2026-04-17, 7 дней) — берётся как baseline для оценки эффекта:

| Метрика | Значение до релиза | Источник |
|---------|-------------------:|----------|
| Конверсия в оплату (`processing_start` → `payment_success`) | **TODO: замерить** | PostHog funnel |
| Конверсия в скачивание (`processing_start` → `download_click`) | TODO | PostHog funnel |
| Share-rate после скачивания (`share_popup_shown` → `share_click`) | TODO | PostHog |
| Медианное `pipelineTimeMs` | TODO | Supabase `jobs.statistics` |
| Доля 504 на `process-gost` | TODO | Vercel logs |
| Abandon-rate на processing screen (pages exit mid-flow) | TODO | PostHog |

**Окно измерения «после»**: 2026-04-17 12:08 MSK → 2026-04-24 12:08 MSK (7 дней).
**Ожидаемый эффект**: +15–30% к конверсии в оплату, −80% 504-ошибок, +20% share-rate.

**Revert trigger**: если конверсия просядет ≥10% через 3 дня — откатить (revert [4e88db1](https://github.com/pilipenkosv-droid/my-petproject-2/commit/4e88db1) и [ce73eae](https://github.com/pilipenkosv-droid/my-petproject-2/commit/ce73eae)).

## Verification

- Lint / tsc — чисто
- Preview `/create` — рендерится без console errors, новая структура подтверждена
- E2E на проде: после деплоя пройти ГОСТ-поток и методичка-поток, проверить что 504 ушёл и плашка времени под H1 показывает ≥60 сек

## Follow-ups

- [ ] Через 7 дней: сравнить метрики, заполнить таблицу «до/после», решение о rollback/keep
- [ ] Если эффект положительный — A/B-тест длительности анимации (60s vs 75s vs 90s)
- [ ] Проверить, что `animate-in fade-in` из `tailwindcss-animate` корректно работает в Safari
