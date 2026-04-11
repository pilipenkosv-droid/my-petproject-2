# ADR-007: Structural Chunking + Recursive Retry для AI Block Markup

**Date:** 2026-04-11
**Status:** Accepted
**Context:** AI-разметка больших документов (~1200+ параграфов) давала 30-40% unknown из-за JSON truncation и каскадных rate limit failures.

## Проблема

Chunks по 150 параграфов были слишком большими для Gemini Flash Lite:
1. **JSON truncation** — модель не успевала сгенерировать полный JSON, ответ обрезался
2. **Каскадный отказ** — при ошибке одного чанка весь блок (150 параграфов) получал fallback unknown
3. **Потеря контекста** — чанки резались произвольно, разрывая логические секции документа
4. **Rate limits** — параллельная обработка 30 чанков исчерпывала лимиты, retry усугублял проблему

## Решение

### 1. Структурный чанкинг (RAG-inspired)

Вместо фиксированного размера 150, режем по смысловым границам документа:

- **TARGET_CHUNK_SIZE = 50**, MAX = 70, MIN = 15
- Приоритет границ (scoring system):
  - `100` — секция документа (Введение, Заключение, Приложение, Список литературы)
  - `80` — Word Heading стиль (Heading1, Heading2...)
  - `70` — нумерованный заголовок (`1.2 Название`)
  - `30` — пустой параграф (естественный разделитель)
  - `+10` бонус за близость к TARGET (±5)

### 2. Контекстное обогащение (Context Enrichment)

Каждый чанк получает:
- **Section heading** — заголовок текущего раздела (pre-computed Map, O(n))
- **Overlap paragraphs** — 5 последних параграфов предыдущего чанка с их blockType

Это даёт модели понимание, в каком контексте находятся параграфы.

### 3. Hallucination normalization

15+ маппингов частых AI-ошибок → валидные blockType:
- `annotation` → `title_page_annotation`
- `header` → `title_page_header`
- `text` → `body_text`
- и т.д.

Применяется ДО Zod-валидации, предотвращая отказ всего чанка из-за одного невалидного значения.

### 4. Recursive retry on failure

При ошибке парсинга чанка (JSON truncation, rate limit):
1. Разбивает чанк пополам
2. **Последовательно** (не параллельно) обрабатывает обе половины
3. Задержка 500ms × depth перед retry + 300ms между половинами
4. Max depth = 2, min chunk size = 10

Последовательная обработка + задержки предотвращают каскадное исчерпание rate limits.

### 5. Post-validation (rule-based)

8 правил автоматической коррекции без AI:
1. Пустые параграфы → `empty`
2. Номера страниц (1-4 цифры) → `page_number`
3. "Рисунок N" → `figure_caption`
4. "Таблица N" → `table_caption`
5. Heading стили Word → `heading_*`
6. Списочные маркеры → `list_item`
7. Уточнение `title_page` подтипов (annotation, footer)
8. Язык bibliography_entry (ru/en)

### 6. Pipeline timing

`pipelineTimeMs` и `markupTimeMs` отслеживаются end-to-end:
- Возвращаются в `DocumentStatistics`
- Отображаются в `StatisticsPanel` (5-я карточка "Время обработки")
- UX-элемент для шеринга: "Diplox оформил 73 стр. за 42 сек"

## Результаты

### Quality bench: ndN3Vip2HhVo6cWoL89hv (1264 параграфа, 73 стр.)

| Метрика | До (150/chunk) | Structural 50/chunk | + Recursive retry |
|---------|----------------|--------------------|--------------------|
| Unknown % | 30-40% | 6% | **1%** |
| Failed chunks | N/A | 2/30 | **0/30** |
| Lists | 9 items | 48 items | **50 items** |
| TOC | Иногда пропадало | PASS | **PASS** |
| Landscape | PASS | PASS | **PASS** |
| Content delta | ~3% | ~3% | **3%** |
| Время | ~30s | ~61s | **65s** |

### Стоимость

- 30 чанков × ~50 параграфов = 30 AI-вызовов (+ 1-2 retry при failures)
- ~$0.01-0.02 за документ через AITUNNEL Gemini Flash Lite
- 3 AI-вызова на AI captions для безымянных таблиц
- Итого: **~$0.02-0.03 за документ**

## Альтернативы

1. **Увеличить maxTokens** — не помогло бы с rate limits и каскадными отказами
2. **Переход на более мощную модель** — дороже, Flash Lite достаточен при малых чанках
3. **Параллельный retry** — отвергнут: усугубляет rate limit проблему
4. **Уменьшить до 20-30 параграфов** — больше запросов, выше стоимость, незначительное улучшение качества

## Файлы

| Файл | Назначение |
|------|-----------|
| `src/lib/ai/document-block-markup.ts` | Структурный чанкинг, recursive retry, post-validation, timing |
| `src/lib/ai/block-markup-prompts.ts` | Промпт с контекстом (section heading + overlap) |
| `src/lib/ai/block-markup-schemas.ts` | Zod-схемы для валидации AI-ответов |
| `scripts/test-quality-bench.ts` | Quality bench с deep XML inspection |
| `src/types/formatting-rules.ts` | pipelineTimeMs, markupTimeMs в DocumentStatistics |
| `src/features/result/components/StatisticsPanel.tsx` | UX: карточка "Время обработки" |

## Последствия

- Unknown снижен до 1% — все форматировочные шаги работают корректно
- 0 failed chunks — полная надёжность при 30 чанках
- Recursive retry + backoff = устойчивость к rate limits без потери качества
- Pipeline timing — основа для UX шеринга и будущей оптимизации
- `document-block-markup.ts` вырос до 469 строк (>300 лимит) — запланировать декомпозицию
