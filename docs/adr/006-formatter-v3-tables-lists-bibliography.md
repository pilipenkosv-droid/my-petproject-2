# ADR-006: Formatter v3 — таблицы, списки, библиография

**Date:** 2026-04-11
**Status:** Accepted
**Context:** Качественный bench (ADR-005) выявил системные проблемы: широкие таблицы обрезаются, списки без Word numbering, NBSP в библиографии ставится перед названием вместо между фамилией и инициалами, подписи AI генерируют мусор.

## Изменения

### 1. Landscape-секции для широких таблиц

**Файл:** `src/lib/formatters/table-landscape-formatter.ts` (новый)

ГОСТ 7.32-2017 п.6.7 разрешает альбомную ориентацию для таблиц с большим количеством столбцов.

**Детекция ширины:**
- Сумма `w:gridCol` > доступной ширины портрета (~9355 twips) при >=4 столбцах
- Количество столбцов >= 7 (эвристика)
- Минимум 4 столбца (защита от false positive на layout-таблицах)

**Реализация:** OOXML section breaks:
1. Пустой параграф с `w:sectPr` (portrait, nextPage) перед таблицей/подписью
2. Пустой параграф с `w:sectPr` (landscape, nextPage) после таблицы
3. Подпись таблицы включается в landscape-секцию

**Pipeline:** Последний шаг (после TOC), не зависит от enrichedParagraphs.

### 2. Word numbering для списков

**Файл:** `src/lib/formatters/list-formatter.ts` (новый)

ГОСТ 7.32-2017 п.4.4/5.3: списки должны быть Word numbering entities, не ручными маркерами.

**Три типа списков:**
- Маркированные (–): `w:numFmt bullet`, `w:lvlText "–"`
- Цифровые (1), 2)): `w:numFmt decimal`, `w:lvlText "%1)"`
- Буквенные (а), б)): `w:numFmt russianLower`, `w:lvlText "%1)"`

**Реализация:**
- Детекция типа по тексту (regex на маркеры)
- Удаление ручных маркеров из текста
- Создание `numbering.xml` с `w:abstractNum` + `w:num`
- Привязка через `w:numPr` (numId + ilvl) в `w:pPr`
- Обеспечение связей в `.rels` и `[Content_Types].xml`

**Pipeline:** После cleanup, перед text fixes (маркеры должны быть интактны для детекции).

### 3. Исправления библиографии

**Файл:** `src/lib/formatters/bibliography-xml-formatter.ts`

**NBSP баг (критический):** Regex `([А-ЯЁ])\.\s+([А-ЯЁ][а-яё]+)` ошибочно матчил "В. Порождение" как "инициал + фамилия", ставя NBSP перед первым словом названия.

**Исправление:**
- Убран greedy regex initial→word
- Добавлен точный regex surname→initial: `([А-ЯЁ][а-яё]{2,})\s+([А-ЯЁ]\.)`
- Результат: `Ахутина←NBSP→Т.В. Порождение` (NBSP между фамилией и инициалами)

**bibliography_title:** Добавлены Heading1 style, outlineLvl 0 (для TOC), pageBreakBefore, center alignment. Ранее отсутствовали.

### 4. Валидация AI-подписей

**Файл:** `src/lib/formatters/ai-caption-generator.ts`

Функция `isValidCaption()` отсекает мусорные подписи:
- "Пустая таблица", "без названия", "без заголовка"
- Слишком короткие (<5) или длинные (>120)
- Начинающиеся с "Таблица"/"Рисунок" (AI должен возвращать только описание)

### 5. Очистка ячеек таблиц

**Файл:** `src/lib/formatters/document-cleanup-formatter.ts`

Упрощена `cleanTableCellEmptyParagraphs()`: теперь удаляет ВСЕ пустые параграфы в ячейках (ранее — только 2+ подряд, оставляя "висячие Enter").

### 6. Ссылки с №

**Файл:** `src/lib/formatters/caption-numbering-formatter.ts`

`TABLE_REF_PATTERN` и `FIGURE_REF_PATTERN` теперь матчат "таблице №1", "рис. №3" (добавлен `№?` в regex).

### 7. Титульная страница (из предыдущей сессии)

- 5 подтипов AI-разметки: header, title, info, annotation, footer
- Отдельная секция с равными полями 20мм для центрирования
- Сохранение подчёркиваний только на title_page

### 8. TOC и заголовки (из предыдущей сессии)

- Heading styles (w:pStyle Heading1/2/3) + outlineLvl — критично для TOC field code
- Удаление table-based TOC (старый формат пользователя)
- ensureHeadingStyles() в styles.xml
- Объединение многострочных заголовков (Enter внутри заголовка)

## Порядок pipeline

```
1. XmlDocumentFormatter (margins, fonts, styles, heading styles)
2. applyDocumentCleanup (merge headings, numbering, cell cleanup, section breaks)
3. applyListFormatting (Word numbering + marker removal)
4. applyAllTextFixes (NBSP, quotes, dashes, abbreviations)
5. applyCaptionNumbering (normalize + renumber)
6. applyAiCaptions (generate + validate)
7. applyTocGeneration (field code + styles)
8. applyLandscapeForWideTables (section breaks for wide tables)
```

## Результат

Quality bench: 90-95/100 (разброс из-за AI markup variance AITUNNEL).
Тестовый документ: 596 параграфов, 21 wide table → landscape, 21 list items → Word numbering.

## Риски

- AITUNNEL нестабильность: 0-15% параграфов могут получить `unknown` blockType при timeout
- `russianLower` numFmt: не все версии Word/LibreOffice поддерживают
- Landscape section breaks: могут конфликтовать с существующими section breaks в документе
