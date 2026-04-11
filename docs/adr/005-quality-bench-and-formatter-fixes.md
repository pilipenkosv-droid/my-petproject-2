# ADR-005: Quality Bench — автоматическая проверка качества форматирования

**Date:** 2026-04-11
**Status:** Accepted
**Context:** Необходим воспроизводимый способ измерять качество форматирования и находить регрессии. Ручная проверка не масштабируется.

## Проблема

Formatter v2 добавил сложные этапы (block-markup AI, TOC, caption generation, heading numbering). Каждое изменение могло сломать что-то другое. Нужен автоматический бенчмарк.

## Решение: двухуровневый quality bench

### Level 1 — Программные XML-проверки (`scripts/quality-checks.ts`)

30+ метрик, сгруппированных по категориям:

| Категория | Метрики | Вес |
|-----------|---------|-----|
| **page** | pageSize (A4), margins (ГОСТ) | 15% |
| **text** | fontName, fontSize, lineSpacing, alignment, firstLineIndent, bibliographyIndent | 25% |
| **headings** | headingFont, headingSize, headingBold, headingAlignment, headingNumbering | 20% |
| **structure** | hasTOC, hasPageNumbers, sectionBreak, headingHierarchy | 15% |
| **tables** | tableBorders, tableHeader (w:tblHeader), tableFontSize | 10% |
| **images** | figureCaptions | 5% |
| **preservation** | paragraphCountDelta, textPreservation | 10% |

Каждая метрика: `pass` (1.0), `partial` (0.5), `fail` (0.0). Итоговый балл = взвешенная сумма.

### Level 2 — AI-ревью (Opus)

Верификация Opus — субъективная оценка «как выглядит документ» по 5-балльной шкале. Пока не автоматизировано.

### Ключевое решение: text-based paragraph matching

**Проблема:** После вставки TOC (~10 параграфов) и AI-caption, индексы параграфов в отформатированном документе сдвигаются. `enrichedMap.get(paragraphIndex)` возвращает неверный параграф → ложные failures.

**Решение:** Функция `lookupEnriched`:
1. Пробует index-based lookup
2. Верифицирует совпадение текста (similarity check)
3. При несовпадении → text-based fallback (Map по тексту параграфа)
4. Для пронумерованных заголовков: strip number prefix ("2.1 Введение" → "Введение")

Это **единственное изменение** подняло score с 78 до 95.

## Прогресс по циклам

| Цикл | Score | Ключевые находки и фиксы |
|------|-------|--------------------------|
| 1 | 69/100 | Базовый прогон, выявлены основные проблемы |
| 2 | 76/100 | Фикс heading numbering regex, structural heading matching |
| 3 | 78/100 | firstLine/hanging conflict, w:tblHeader, section break |
| 4 | **95/100** | Text-based paragraph matching (root cause ложных failures) |

### Детали score 95/100

| Категория | Score |
|-----------|-------|
| page | 100% |
| text | 89% (lineSpacing partial — AITUNNEL truncation) |
| headings | 100% |
| structure | 100% |
| tables | 100% |
| images | 100% |
| preservation | 100% |

## Найденные и исправленные баги форматтера

### 1. firstLine/hanging indent конфликт (`xml-formatter.ts`)
В Word OOXML `w:ind` firstLine и hanging взаимоисключающие. Установка firstLine без удаления hanging приводит к невалидному XML.
**Фикс:** При установке firstLine → `delete ind['@_w:hanging']`, и наоборот.

### 2. w:tblHeader для ГОСТ (`xml-formatter.ts`)
ГОСТ требует повторение шапки таблицы при разрыве на следующую страницу.
**Фикс:** Добавляем `w:tblHeader` в `w:trPr` первой строки каждой таблицы с >1 строкой.

### 3. Section break после титульной страницы (`document-cleanup-formatter.ts`)
Нумерация страниц должна начинаться со 2-й страницы (после титула).
**Фикс:** `insertSectionBreakAfterTitle` — вставляет `w:sectPr` с A4 размерами, ГОСТ полями, `pgNumType start=1`.

### 4. Heading numbering regex (`document-cleanup-formatter.ts`)
Старый regex `/^\d[\d.]*\s*/` не обрабатывал "1. 1 Текст", "Глава 1 Текст".
**Фикс:** `/^(?:глава\s+)?\d[\d.\s]*(?:\.\s*)?/i`

### 5. Structural heading matching (`document-cleanup-formatter.ts`)
"введение." не находилось в Set структурных заголовков.
**Фикс:** `.replace(/\.+$/, "")` перед lookup.

### 6. collapseSpacesEverywhere (`document-cleanup-formatter.ts`)
Множественные пробелы и двойные точки в тексте параграфов и таблиц.
**Фикс:** Новый шаг обработки — проходит ВСЕ параграфы (body + таблицы).

### 7. Table cell text fixes (`document-formatter.ts`)
Text fixes (abbreviations, spaces, dots) не применялись к текстам внутри таблиц.
**Фикс:** Дополнительный проход по `w:tbl→w:tr→w:tc→w:p`.

### 8. Inter-chunk rate-limiter reset (`document-block-markup.ts`)
При больших документах (>150 параграфов) AITUNNEL может вернуть truncated JSON → markModelFailed → все последующие чанки fail.
**Фикс:** `recordUsage(modelId)` между чанками сбрасывает consecutiveErrors.

## Оставшаяся проблема: lineSpacing

**Root cause:** AITUNNEL иногда возвращает truncated JSON (обрезанный ответ). При парсинге чанка происходит Zod validation error → весь чанк получает fallback (unknown). Параграфы с `blockType: unknown` не форматируются → lineSpacing остаётся оригинальным.

**Решение:** Переход на Vercel AI SDK с прямым Gemini API (бесплатно через Vercel AI Gateway). Это устранит truncation проблему.

## Стоимость bench-прогона

- Block markup: 2 AI-вызова (2 чанка × 150 параграфов)
- Quality checks: 0 AI-вызовов (чистый XML-анализ)
- **~$0.003 за прогон** через AITUNNEL Gemini Flash Lite

## Файлы

| Файл | Назначение |
|------|-----------|
| `scripts/quality-checks.ts` | 30+ XML-проверок, scoring, text-based matching |
| `scripts/format-quality-bench.ts` | Оркестратор: загрузка → форматирование → проверка |

## Последствия

- Любое изменение форматтера можно проверить за ~30 сек и ~$0.003
- Регрессии обнаруживаются до деплоя
- Score 95/100 — baseline для будущих изменений
- Text-based matching — архитектурный паттерн для любых post-processing проверок formatted DOCX
