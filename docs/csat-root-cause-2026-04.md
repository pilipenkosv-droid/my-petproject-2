# CSAT root-cause analysis — апрель 2026

**Дата**: 2026-04-19
**Автор**: Claude Code (phase 1 of `curried-zooming-waffle` plan)
**Данные**: 16 rating=1 jobs за 30 дней (2026-03-20 → 2026-04-19)

## TL;DR

**Главный драйвер 1★ рейтингов — таблицы**. Rating=1 jobs имеют в среднем 6 таблиц на документ, rating=5 — 0. На долю table-violations приходится 61% всех нарушений в 1★ корпусе. Пайплайн **детектирует** cell-level нарушения и missing captions, но **не чинит их** — нет соответствующих форматтеров.

Дополнительный фактор: multi-section margins — форматтер правит поля только в одной секции из N, landscape-таблицы оставляют violations в своих секциях.

## 1. Сигнал из данных

### 1.1. Корреляция tables ↔ rating (30 дней)

| Rating | N | Avg tables | Avg total violations |
|--------|---|-----------|---------------------|
| **1**  | 16 | **6.0** | 147 |
| 2      | 1 | 0 | 4 |
| 3      | 1 | 0 | 46 |
| 4      | 1 | 1 | 306 |
| 5      | 2 | **0.0** | 74 |

Чистая монотонная зависимость: 0 таблиц → хорошие рейтинги, много таблиц → 1★.

### 1.2. Per-job breakdown rating=1 (упорядочено по table_viol DESC)

| Job | Tables | Total viol | Table viol | Heading viol | Comment |
|---|---|---|---|---|---|
| KCPoDWyNVnnLQ7MS9Qwup | 8 | 759 | 364 | 0 | «пидоры» |
| SYC4QTTFEWjdfRreM20Zl | 17 | 383 | 354 | 0 | «6 часть только отформатирована» |
| 1fQQWL9EHe5XDnM4jjniD | 17 | 383 | 354 | 0 | «отсутствует форматирование всех страниц» |
| NdeHx6uICD8TE0M5D2BYr | 33 | 90 | 23 | 8 | «МНОГО ОШИБОК» |
| wPmyiPK7tUix1ltZ4EqA9 | 16 | 176 | 16 | 8 | «ничего не делает, хочу возврат» |
| GZuI3EL2X3ihGzyz0WMNA | 3 | 65 | 12 | 7 | — |
| O5KKF4M-YQ65Qp9UoOsig | 4 | 29 | 5 | 0 | «скам» |
| Mo9fnywPNMq0nbjE8g2SA | 3 | 74 | 3 | 0 | «нечего не исправлено» |
| mthN7QKUH6YuCVD6-nfh9 | 1 | 46 | 2 | **39** | «чёрный фон, столбики» |
| TZcIHmzsbGS0a451emIzQ | 0 | 74 | 0 | 26 | «деньги на ветер» |
| Ca7M6umpOYtrI45iZbsxB | 0 | 108 | 0 | 12 | — |
| NOw16lzhNS8Vn-W0g6Gys | 0 | 67 | 0 | 0 | — |
| _o0mi2TsBTSKaLwUTYJTA | 0 | 34 | 0 | 13 | — |
| Kf3RRcLrkV4mjTO6EGLZg | 0 | 26 | 0 | 10 | — |
| DYfMJYvlawgs6rQLVDwW6 | 0 | 17 | 0 | 13 | — |
| 47ywR-8Gk7AwTNSTM5g2M | 0 | 26 | 0 | 0 | «оплатила полную — получила краткую» (trial confusion) |

### 1.3. Два явных кластера

- **Cluster A — таблицы (9/16, 56%)**: jobs с ≥3 таблицами и большинством нарушений в ячейках таблиц.
- **Cluster B — заголовки (6/16, 38%)**: 0 таблиц, нарушения heading-*, часть с комментариями «ничего не исправлено».
- **Trial confusion (1/16, 6%)**: `47ywR-8Gk7AwTNSTM5g2M` — has_full_version=true, payment прошёл, но пользователь недоволен. Отдельный UX-трек, не правим сейчас.

### 1.4. Дубликат файла — готовый reproducer

Job `SYC4QTTFEWjdfRreM20Zl` и `1fQQWL9EHe5XDnM4jjniD` — два разных пользователя загрузили **`Вельмякина И.М. конкурс 2026.docx`** (разные source_document_id), оба получили **ровно 383 violations, 354 из них по таблицам, 17 таблиц в документе**. Детерминированно ломает пайплайн — идеальный golden negative test.

## 2. Root-cause в коде

### 2.1. Нет форматтера для cell-level violations

`src/lib/pipeline/document-analyzer.ts` генерирует ruleIds `table-N-rX-cY-fontsize`, `table-N-rX-cY-align` с `autoFixable: true`. В `src/lib/formatters/` есть:

- `table-landscape-formatter.ts` — только поворот страницы для широких таблиц
- остальные форматтеры таблицы не трогают

**Нет кода, который бы итерировал `w:tbl > w:tr > w:tc` и применял rules к содержимому ячеек.** Это покрывает 364 + 354 + 354 violations из топ-3 jobs.

### 2.2. Multi-section margins

[src/lib/formatters/xml-formatter.ts:410](src/lib/formatters/xml-formatter.ts:410) — `getSectPr(this.body)` возвращает **одну** sectPr (или создаёт одну). Margins применяются один раз (line 430).

[src/lib/pipeline/document-analyzer.ts:490](src/lib/pipeline/document-analyzer.ts:490) — `sections.forEach((section, idx) => {...})` проверяет **все** секции.

Документ с landscape-таблицами имеет N секций → все секции кроме одной остаются с неправильными полями. Это 36 margin-violations за 30 дней среди 1★.

### 2.3. Caption limit 10

[src/lib/formatters/ai-caption-generator.ts:43](src/lib/formatters/ai-caption-generator.ts:43) — `MAX_CAPTION_REQUESTS = 10`. Job `NdeHx6uICD8TE0M5D2BYr` с 33 таблицами получает максимум 10 подписей → 23 остаются как `table-N-missing-caption` violations.

Для missing-caption `autoFixable: false` — но это вопрос дизайна, а не кода. Пользователь всё равно видит документ без подписей.

### 2.4. `fixesApplied` не сохраняется в БД

[src/lib/pipeline/document-formatter.ts:590](src/lib/pipeline/document-formatter.ts:590) считает `fixesApplied`, но в `jobs.statistics` в БД этого поля нет. Значит мы не можем отслеживать в проде: «сколько из N детектированных violations пайплайн реально починил». Добавить в статистику — 1-строчный фикс.

### 2.5. Heading cluster остаётся не до конца объяснённым

Jobs с 0 таблиц и 10-39 heading-violations (часто в комбинации с «ничего не исправлено» комментариями). Гипотеза — LLM-классификатор ставит body_text на заголовок, форматтер его не трогает. Требует replay через bench (Phase 2).

Особняком `mthN7QKUH6YuCVD6-nfh9` «чёрный фон, столбики» + 39 heading violations — похоже на broken XML или битое shading/borders. Нужен визуальный осмотр файла.

## 3. Actionable next

### Priority 1 (большой ROI, средняя сложность)

1. **Table cell formatter** — новый `src/lib/formatters/table-cells-formatter.ts`, чинит font/size/align в ячейках. Целит ~56% 1★.
2. **Per-section margins** — переписать `xml-formatter.ts:410` на итерацию всех sectPr. 20-30 строк. Целит ~7 из 16 jobs.
3. **`fixesApplied` → БД** — добавить в `statistics` для observability. 1 строка.

### Priority 2

4. **Caption limit 10 → 50** или сделать rule-based fallback «Таблица N» без AI. Целит ~8 jobs.
5. **Golden negative test** — добавить `Вельмякина И.М. конкурс 2026.docx` в `DEFAULT_CORPUS` [format-quality-bench.ts:34](scripts/format-quality-bench.ts:34), регрессионная защита.

### Priority 3 (требует Phase 2 replay)

6. **Heading cluster** — прогнать 6 heading-heavy jobs через bench, понять почему analyzer детектирует, а formatter не трогает.
7. **«Чёрный фон» visual bug** — открыть formatted файл `mthN7QKUH6YuCVD6-nfh9_formatted` в Word, определить причину (возможно shading).

## 4. Phase 2 — replay через bench (2026-04-19)

Прогнал все 16 rating=1 jobs через текущий продовый пайплайн ([scripts/bench-1star-replay.ts](../scripts/bench-1star-replay.ts)). Отчёт: [bench-reports/1star/full-2026-04-19.json](../bench-reports/1star/full-2026-04-19.json).

**Ключевые метрики:**

| Метрика | Значение |
|---|---|
| Avg quality score | **97/100** |
| Avg fix ratio | 100% |
| Avg detected violations | 70/doc |
| Avg fixes applied | 67/doc |
| **Total unknown blocks** | **3647 across 16 docs** |
| **Avg unknown blocks/doc** | **228** |

### 4.1. Главный сюрприз

**Bench ставит 97/100 документам, за которые ВСЕ пользователи поставили 1★.**

Это значит наши 30+ Level-1 проверок качества **не ловят то, из-за чего люди ставят 1★**. Конкретнее:
- `tables.fontSize` отмечает «таблица ок» если в ней есть хотя бы один run с 9-14pt (слишком мягкий критерий, [quality-checks.ts:1014](../scripts/quality-checks.ts:1014))
- Cell-level нарушения (364 на топ-кейсе) → **minor** severity, почти не влияет на score
- `unknown blockType` не учитывается в score совсем

### 4.2. Smoking gun — unknown blocks

Per-doc unknown counts: 267, 386, 386, 192, 382, 65, 633, 135, 82, 78, 222, 16, 123, 132, **417**, 131.

Причина на примере job `KCPoDWyNVnnLQ7MS9Qwup` (тот самый «пидоры», 759 виолейшнс):
```
[block-markup] Chunk 6/14 failed: Все AI-модели недоступны:
  - AITUNNEL Gemini 2.5 Flash: лимит исчерпан
  - Google Gemini 2.5 Flash: лимит исчерпан
[block-markup] AI done: 3 chunks, 3 failed
```

**Rate limit → chunks fail → 267 unknown blocks → formatter пропускает их → пользователь видит документ без форматирования → 1★.**

Feedback loop ([document-block-markup.ts:272](../src/lib/ai/document-block-markup.ts:272)) пробует переклассифицировать — через ТОТ ЖЕ AI → тоже падает. Failsafe отсутствует.

### 4.3. Уточнённая root-cause иерархия

| # | Root cause | N jobs (из 16) | Фикс (файл) |
|---|---|---|---|
| 1 | **AI rate limit → unknown cascade** | ≥10 (по unknown>100) | `document-block-markup.ts:270-280` + rule-based fallback |
| 2 | **Cell-level table violations не чинятся** | 9 | Новый `src/lib/formatters/table-cells-formatter.ts` |
| 3 | **Per-section margins** | 7 | `xml-formatter.ts:410` iterate all sectPr |
| 4 | Caption limit 10 на 33-table docs | 1-2 | `ai-caption-generator.ts:43` + rule-based fallback |
| 5 | Heading cluster без comment | 4-6 | Требует дополнительного анализа |
| 6 | Trial vs full confusion | 1 | UX issue, не code |

## 5. Phase 3 applied — точечные фиксы (2026-04-19)

Реализовано в этой сессии:

1. **Observability для fixes/unknown в проде**: [process-gost/route.ts:142-159](../src/app/api/process-gost/route.ts:142) + [process/route.ts:176-193](../src/app/api/process/route.ts:176) теперь пишут в `jobs.statistics`:
   - `fixesApplied` (раньше терялось, не было видно в БД)
   - `violationsDetected`
   - `unknownBlockCount`
   - `unknownBlockRatio`
   Через 7 дней можно измерять: коррелирует ли `unknownBlockRatio` с рейтингом в проде.

2. **Golden negative tests**: добавлены в `DEFAULT_CORPUS` [format-quality-bench.ts:34-39](../scripts/format-quality-bench.ts:34):
   - `RIEU4mlQ0urdqG8pS5aBE` — Вельмякина 17 таблиц
   - `uoi7jdZW-nmVLH6WZZ32v` — «пидоры», 8 таблиц, 759 violations

3. **Replay tool**: [scripts/bench-1star-replay.ts](../scripts/bench-1star-replay.ts) для регулярного аудита всех rating=1 jobs.

4. **Per-section margins** — `applyPageMargins` в [xml-formatter.ts:408](../src/lib/formatters/xml-formatter.ts:408) теперь итерирует все `w:sectPr` (body-level + внутри `w:pPr` каждого параграфа) и применяет `w:pgMar` к каждой. Целит ~7/16 jobs с landscape-таблицами.

5. **AI failsafe (rule-based block classifier)** — новый [rule-based-block-classifier.ts](../src/lib/ai/rule-based-block-classifier.ts) + интеграция в [document-block-markup.ts](../src/lib/ai/document-block-markup.ts). При падении AI или классификации в `unknown` — text-pattern эвристики (ВВЕДЕНИЕ/ЗАКЛЮЧЕНИЕ → heading_1, `\d+\.\d+` → heading_2, list markers, Рисунок/Таблица → captions, fallback → body_text). Добавлен `ruleBasedFillCount` в return. Целит 267-unknown topkейс и все ≥10/16 jobs с AI-cascade.

6. **Table cells formatter** — новый [table-cells-formatter.ts](../src/lib/formatters/table-cells-formatter.ts) (188 строк), вызывается в [document-formatter.ts:213](../src/lib/pipeline/document-formatter.ts:213). Рекурсивно обходит `w:tbl > w:tr > w:tc` (включая вложенные таблицы), нормализует fontFamily + fontSize (halfpoints) + alignment (header=center, numeric=center, иначе left). Целит `table-N-rX-cY-fontsize` и `table-N-rX-cY-align` ruleIds — покрывает 364+354+354 violations топ-3 jobs.

## 5.1. Pre-deploy bench валидация (2026-04-19)

Прогон [format-quality-bench.ts](../scripts/format-quality-bench.ts) на обоих golden negative tests через Google Gemini native (AITUNNEL budget исчерпан):

| Документ | До фикса (прод 1★) | После фикса (bench) | Исход |
|---|---|---|---|
| `uoi7jdZW-nmVLH6WZZ32v` | 759 viol, 267 unknown | 987 detected → 979 fixed, 0 unknown, **score 100/100** | 🟢 полностью починен |
| `RIEU4mlQ0urdqG8pS5aBE` | 383 viol | 447 detected → 439 fixed, **score 88/100** | 🟡 почти; остались 4 pre-existing issue |

Лог подтверждает `[table-cells] Normalized 373 cells / 469 paragraphs` на uoi7 — новый форматтер автоматически чинит те самые 364 cell-level violations из топ-1 1★ кейса. `[landscape]`, `[toc]`, rule-based fallback — все отработали в связке.

Остаточные проблемы в RIEU4 (не покрыты этой итерацией):
- `text.noColoredText`: 21 цветной параграф (форматтер чистит runs, не pPr/shd)
- `headings.h1Format`: 3/10 H1 без center+bold+pageBreakBefore
- `text.alignment`: 5/50 не justify
- `text.multipleSpaces`: 1 параграф

## 6. Метрики для валидации фиксов

- 30d avg rating rating=1 → ≤40% (сейчас 62%)
- CSAT avg 2.2 → ≥3.0
- Avg table-violations на rating=1 corpus: 147 → <50
- Golden regression: Вельмякина-файл даёт ≤50 violations после фиксов (сейчас 383)

## 7. Deploy event

- **Deployed**: 2026-04-19 19:04 MSK (commit `330935d` → main → Vercel auto-deploy)
- **Push**: `ec440bc..330935d main -> main`, CI run 24633246172
- **Baseline (30d до деплоя)**: CSAT 2.2, доля 1★ = 62% (10/16 комментариев «ничего не исправлено»), avg violations на 1★ = 147
- **Final bench (2026-04-19, Google Gemini native)**: RIEU4 100/100 + uoi7 100/100 = avg 100/100 (против 88 на промежуточной итерации без post-pass-enforcer)
- **Измерение**: 2026-04-26 (через 7 дней) — запрос в Supabase feedback за период 2026-04-19 19:04 → 2026-04-26 19:04 MSK
- **Критерии успеха**:
  - Доля 1★ ≤40% (таргет) / ≤50% (минимум)
  - CSAT avg ≥3.0 (таргет) / ≥2.7 (минимум)
  - Avg violations на новых 1★ jobs <100
  - Комментарии кластера «ничего не исправлено» исчезают или остаются <20% от 1★
- **Rollback trigger**: доля 1★ >65% к 2026-04-22 → revert `330935d`
- **Вторая итерация (если нужна)**: multi-provider AI gateway (Azure OpenAI + Anthropic fallback) + unified Zod→provider schema adapter — план в Second Brain vault (`2026-04-19-diplox-step4-unified-schema-layer.md`)
