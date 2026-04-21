# ADR-010 — Список правил ГОСТ 7.32 для pipeline-v6 checker

- Дата: 2026-04-21
- Статус: accepted (v1: 30 реализовано, 16 запланировано на Недели 2–4)
- Связанные: [pipeline-v6/README](../../src/lib/pipeline-v6/README.md), [strategy-v2](../../../Second%20brain/vault/thoughts/projects/2026-04-21-diplox-formatting-strategy-v2.md)

## Контекст

Стратегия v2 требует **detect deterministic, fix-suggest LLM**: 46 правил ГОСТ 7.32 реализованы как TS-функции поверх OOXML AST. LLM зовётся только когда правило нарушено.

Референс — [GOSTy](https://github.com/NovayaGazeta/GOSTy) (46 правил), но там Python + .doc, у нас TS + .docx.

Baseline — `scripts/quality-checks.ts` (перенесён в `src/lib/pipeline-v6/checker/index.ts`) уже даёт 30 правил. 16 добираем.

## Решение

Правила нумеруются `<category>.<ruleName>` (id-совместимо с bench-reports). Severity: `critical` (блокирует сдачу), `major` (визуально заметно), `minor` (косметика).

### Уже реализовано в `checker/index.ts` (30)

| # | id | severity | что проверяет |
|---|----|----------|---------------|
| 1 | page.margins.top | critical | Верхнее поле ±2 мм |
| 2 | page.margins.bottom | critical | Нижнее поле |
| 3 | page.margins.left | critical | Левое поле |
| 4 | page.margins.right | critical | Правое поле |
| 5 | text.fontFamily | critical | Шрифт основного текста |
| 6 | text.fontSize | critical | Размер (14 pt по умолчанию) |
| 7 | text.lineSpacing | critical | Межстрочный интервал 1.5 |
| 8 | text.firstLineIndent | critical | Абзацный отступ 12.5 мм |
| 9 | text.alignment | major | justify (both) |
| 10 | text.multipleSpaces | major | Двойные пробелы |
| 11 | text.noUnderline | major | Запрет подчёркивания |
| 12 | text.noColoredText | major | Запрет цвета и highlight |
| 13 | text.doubleDots | minor | Двойные точки |
| 14 | headings.h1Format | critical | center + bold + pageBreakBefore |
| 15 | headings.h2Format | major | justify/left + bold |
| 16 | headings.numbering | major | Нумерация содержательных глав |
| 17 | structure.tocFieldCode | critical | Есть TOC field code |
| 18 | structure.tocHeading | major | Параграф "СОДЕРЖАНИЕ" |
| 19 | structure.titlePage | critical | title_page блоки присутствуют |
| 20 | structure.sectionBreakAfterTitle | major | sectPr после титула |
| 21 | structure.tocNoGarbage | critical | В TOC нет body text/картинок |
| 22 | tables.width | critical | Таблицы ≤ ширины страницы |
| 23 | tables.headerRepeat | major | w:tblHeader на первой строке |
| 24 | tables.emptyCellParagraphs | minor | Нет лишних пустых параграфов |
| 25 | tables.fontSize | minor | 10–14 pt в таблицах |
| 26 | images.noOverflow | major | Рисунки ≤ 165 мм |
| 27 | preservation.images | critical | Все изображения сохранены |
| 28 | preservation.tables | critical | Все таблицы сохранены (±1 TOC) |
| 29 | preservation.contentLoss | * | Потеря символов ≤ 5 % |
| 30 | system.error | critical | Чтение документа не упало |

### Добираем в Неделе 2 (8)

| # | id | severity | что проверяет |
|---|----|----------|---------------|
| 31 | page.size | critical | A4 (11906×16838 twips) |
| 32 | page.pageNumbers | major | Номера страниц в footer, арабские |
| 33 | text.hyphenation | minor | Автоперенос включён |
| 34 | text.paragraphOrphans | minor | `w:widowControl` включён |
| 35 | headings.h3Format | major | Форматирование заголовков 3-го уровня |
| 36 | headings.noSpaceBefore | minor | Заголовки не начинаются с пустого параграфа |
| 37 | structure.bibliographyHeading | major | Параграф "СПИСОК ЛИТЕРАТУРЫ" |
| 38 | structure.appendixNumbering | major | Приложения как "Приложение А/Б/…" |

### Добираем в Неделе 3 (8)

| # | id | severity | что проверяет |
|---|----|----------|---------------|
| 39 | figures.caption.present | major | Каждый рисунок имеет подпись |
| 40 | figures.caption.format | major | Формат "Рисунок N.M — текст" |
| 41 | figures.caption.position | minor | Подпись под рисунком, не над |
| 42 | tables.caption.present | major | Каждая таблица имеет "Таблица N.M" |
| 43 | tables.caption.format | major | Формат подписи таблицы |
| 44 | bibliography.entriesGost71 | critical | Записи соответствуют ГОСТ 7.1 (parser-level) |
| 45 | bibliography.numbering | major | Нумерация сплошная арабскими |
| 46 | formula.ommlPresent | minor | Формулы в OMML, не в картинках |

## Следствия

- `checker/index.ts` переписывается в Неделе 2 в модульный вид: `checker/rules/<id>.ts` + реестр. Сейчас монолит допустим.
- Каждое правило в Неделе 4 получает unit-тест на синтетическом OOXML: `tests/unit/pipeline-v6/rules/<id>.test.ts`.
- При добавлении нового правила обновлять эту таблицу + пересобирать `bench-reports/v6/baseline-*.json`.

## Альтернативы

- Взять GOSTy напрямую — Python, .doc (не .docx), лицензия несовместима. Отклонено.
- Прогонять Word macros — платформенная привязка. Отклонено.
