# Pandoc spike (pipeline-v6 Week 1)

Цель: проверить, что Pandoc 3.x жизнеспособен как assembler для pipeline-v6 — детерминистически собирает .docx с GOST-вёрсткой из Markdown + reference-doc.

## Запуск

```bash
# 1. (one-time) сгенерировать reference-doc заглушку
pandoc -o reference-gost.docx --print-default-data-file reference.docx

# 2. прогнать спайк
npx tsx scripts/pipeline-v6/spike-pandoc/run.ts
```

## Артефакты

| Файл | Назначение |
|---|---|
| `reference-gost.docx` | Pandoc-овский default reference-doc. Стили `Heading1`, `Heading2`, `BodyText`, `TOC` уже описаны. Под GOST шрифт/поля надо донастроить вручную в Word — см. TODO ниже. |
| `sample-input.md` | Синтетический GOST-документ: 3 H1 (Введение, Глава 1, Заключение), Список литературы, 2 LaTeX формулы (inline + display), 1 pipe-table, маркированный и нумерованный списки. |
| `run.ts` | Вызывает `pandoc --reference-doc=... --toc --toc-depth=2`, инспектирует `word/document.xml` JSZip-ом, печатает summary. |
| `out.docx` | Результат прогона (gitignored). |

## Результаты прогона (2026-04-21)

```json
{
  "elapsed_ms": 412,
  "output_bytes": 13454,
  "toc_field_code": true,
  "omml_formulas": 4,
  "tables": 1,
  "heading_1": 3,
  "heading_2": 4
}
```

Все ожидания зелёные:

| Критерий | Результат |
|---|---|
| TOC field code (`TOC \\o`) присутствует | ✓ |
| LaTeX → OMML формулы (≥2) | ✓ (4 элемента: 1 inline + 1 display + wrappers) |
| Простая pipe-table → `<w:tbl>` | ✓ (1 таблица) |
| Heading 1 mapping | ✓ (3 параграфа) |
| Heading 2 mapping | ✓ (4 параграфа) |
| Время выполнения < 3 s | ✓ (0.41 s) |
| Размер output < 2× input | ✓ (13.4 KB vs 2.4 KB md) |

## Ключевые выводы

1. **TOC из коробки.** `--toc --toc-depth=2` ставит TOC field code в начало документа — Word рендерит его при открытии. Закрывает 1 из 6 болевых зон.
2. **OMML формулы из коробки.** LaTeX `\sum_{i=1}^{n}` и `\int_0^T r(t) dt` транспилированы в нативный OMML — редактируются в Word, не картинки. Закрывает 1 из 6 болевых зон.
3. **Heading mapping.** YAML-метаданные + Markdown `#`/`##` → `Heading1`/`Heading2` стилей reference-doc автоматически. После донастройки reference-doc под GOST (центр + bold + pageBreakBefore для H1) — ещё одна зона закрыта.
4. **Простые таблицы.** Pipe-table → нормальная `<w:tbl>` с заголовочной строкой. Закрывает простой кейс.
5. **Скорость.** 412 ms на синтетику ~50 строк. На реальном дипломе ~50 страниц ожидаем <2 s.
6. **Vercel совместимость.** Pandoc — single binary, ~50 MB. Через `child_process` на serverless — рабочий паттерн (community Vercel layers существуют).

## Что НЕ покрыто этим спайком

- Сложные таблицы с merged-cell / multi-header (для них docxtpl-fallback) — отдельный спайк.
- Bibliography по ГОСТ 7.1 (нужен Citation.js + CSL) — Неделя 2.
- Title page по GOST-вёрстке (центровка, пустые строки, печать "ВКР", "Допущена к защите") — Pandoc может через `--metadata-file` + custom template, тестируется в Неделе 2.
- Кастомный reference-doc под GOST (Times New Roman 14 pt, поля 30/20/20/10 mm, justify, отступ 12.5 mm). Сейчас reference-gost.docx — pandoc default. Открыть в Word, поменять стили `Body Text`, `Heading 1-3`, `Page Setup` → пересохранить. Это **ручной шаг**, скрипт `make-reference.sh` в Неделе 2 автоматизирует через python-docx.
- Cross-reference на рисунки/таблицы ("см. таблицу 1.1") — pandoc-crossref filter; интеграция в Неделе 2.

## Рекомендация для ADR-011

**Pandoc — основной assembler pipeline-v6.** Спайк закрывает 4 из 6 болевых зон (TOC, OMML, headings, простые таблицы) одним инструментом за < 1 секунды. Сложные таблицы — оставляем как кейс для docxtpl-fallback (см. соседний spike-docxtpl/README.md).
