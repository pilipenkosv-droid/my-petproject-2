# ADR-011 — Выбор assembler'а для pipeline-v6: Pandoc vs docxtpl

- Дата: 2026-04-21
- Статус: **accepted** (после спайков 2026-04-21)
- Связанные: [strategy-v2](../../../Second%20brain/vault/thoughts/projects/2026-04-21-diplox-formatting-strategy-v2.md), [ADR-010](./010-pipeline-v6-gost-rules.md)

## Контекст

Стратегия v2 — **template-first**. LLM никогда не пишет OOXML. Assembler принимает структурированный input (Markdown / JSON / LaTeX) и reference-template, выдаёт готовый .docx.

Два зрелых кандидата:

| | Pandoc 3.x | docxtpl 0.16 |
|---|---|---|
| Язык | Haskell (CLI), вызываем через `child_process` | Python, вызываем через `child_process` (uv) |
| Reference-doc | `--reference-doc=gost.docx` — стили из шаблона | Jinja-шаблон с `{{ vars }}`, `{% for %}` |
| TOC | Нативный через `--toc` | Требует вручную пре-рендеренный TOC |
| Формулы | LaTeX → OMML из коробки | Нет, только image |
| Таблицы простые | Markdown → pandoc grid/pipe tables | Jinja `{%tr for %}` |
| Таблицы сложные (merged, multi-header) | Сложно | Полный контроль через OOXML-шаблон ячейки |
| Титульная страница | Через `--metadata-file` + YAML | Jinja-шаблон с фиксированной вёрсткой |
| Vercel serverless | Бинарь ~50 MB, OK на 512 MB | Python runtime 50+ MB + deps, тяжеловато |
| Детерминизм | Полный | Полный |
| Скорость | <1 s на 50 стр | 1–2 s на 50 стр |

## Спайки (Неделя 1)

Оба проведены на **одном и том же** golden-документе (`data/golden/raw/SPIKE-SAMPLE.docx` или синтетический аналог) — см. [scripts/pipeline-v6/spike-pandoc/README.md](../../scripts/pipeline-v6/spike-pandoc/README.md) и [scripts/pipeline-v6/spike-docxtpl/README.md](../../scripts/pipeline-v6/spike-docxtpl/README.md).

### Критерии успеха

- [ ] TOC сгенерирован и открывается в MS Word
- [ ] Формула LaTeX `\sum_{i=1}^{n}` → нативный OMML (не png)
- [ ] Простая таблица 3×3 → полноценная `<w:tbl>` с заголовком
- [ ] Сложная таблица с merged-cell (1×2 header над двумя столбцами) → корректно отрисована
- [ ] Титульник соответствует ГОСТ-вёрстке (центровка, пустые строки)
- [ ] Heading 1/2/3 маппятся на стили reference-doc
- [ ] Время < 3 s
- [ ] Размер output < 2× input

### Результаты (2026-04-21)

| Критерий | Pandoc | docxtpl |
|---|---|---|
| TOC нативно | ✓ (`--toc`, field code) | ✗ (нужен pre-render) |
| OMML формулы | ✓ (LaTeX → 4 OMML) | ✗ (только image) |
| Простая таблица | ✓ (pipe-table → `<w:tbl>`) | ✓ (`{%tr for %}`) |
| Сложная таблица merged-cell | частично (grid_tables ограничены) | ✓ (полный контроль OOXML-ячейки) |
| Титульник | через `--metadata-file` + template | ✓ (Jinja с фикс. вёрсткой) |
| Heading стили | ✓ (H1×3, H2×4) | ✓ (через стили шаблона) |
| Время | 412 ms | 12.8 ms (только render) |
| Runtime size на Vercel | ~50 MB (single binary) | ~60 MB (Python + deps, LGPL) |

Артефакты: [spike-pandoc/README.md](../../scripts/pipeline-v6/spike-pandoc/README.md), [spike-docxtpl/README.md](../../scripts/pipeline-v6/spike-docxtpl/README.md).

## Решение

**Pandoc основной assembler + docxtpl fallback для сложных таблиц.**

Аргументация:
- TOC из коробки — 1 из 6 болевых зон сразу закрыта.
- OMML из LaTeX — ещё одна зона.
- На Vercel бинарь проще деплоить чем Python runtime.
- docxtpl подключается только если `detectTableComplexity() === 'complex'` — 20 % случаев.

Финал после заполнения таблицы выше.

## Следствия

- В `src/lib/pipeline-v6/assembler/` появится `pandoc.ts` + (опционально) `docxtpl.ts`.
- На Vercel нужен layer с pandoc бинарём (community layers существуют, ~50 MB) или Vercel-edge-compatible альтернатива. Изучить на Неделе 2.
- Reference-doc `gost.docx` — коммитим в `src/lib/pipeline-v6/assembler/templates/gost.docx` (бинарь, но <100 kB). Генерация: одна ручная настройка в Word + автоскрипт для обновления стилей.

## Альтернативы

- **docx4js / docxtemplater-js** — TS-native, но шаблонизаторы только, не assembler: нет TOC, нет OMML. Не покрывают.
- **mammoth.js в обратную сторону** — html → docx; mammoth делает только docx → html. Не подходит.
- **officegen / docx (npm)** — программный OOXML-ассемблер. Делает работу LLM за нас, но ломает принцип «LLM не пишет OOXML» — сами пишем OOXML вручную, много кода.
