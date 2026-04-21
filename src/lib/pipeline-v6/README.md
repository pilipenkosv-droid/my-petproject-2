# pipeline-v6

Template-first formatting pipeline для дипломов по ГОСТ 7.32. Замена pipeline-v5 (scaffold, не выходил в прод) и текущего активного стека `src/lib/formatters/*` после полного перехода.

Стратегия: `Second brain/vault/thoughts/projects/2026-04-21-diplox-formatting-strategy-v2.md`.

**Статус (2026-04-21):** все недели 1-6 + 15 post-MVP проходов завершены. Средний score `100.0/100` на 19 golden-документах (0 failing checks). Ветка `w17/26-pipeline-v6-week1` готова к merge.

## Как это работает

Оркестратор ([orchestrator.ts](orchestrator.ts)) прогоняет документ через 7 стадий:

```
input.docx
  ↓  1. Extract    — mammoth.js → markdown + структурированные assets (images, tables)
  ↓  2. Analyze    — структурный роут (preserve/heuristic/llm-full)
  ↓  3. Rewrite    — (опционально) LLM переписывает только body, не touchает headings/tables
  ↓  4. Assemble   — Pandoc CLI собирает docx по reference-doc=reference-gost.docx
  ↓  5. Check      — 30 правил ГОСТ 7.32 (margins, font, spacing, TOC, title page, etc.)
  ↓  6. Auto-fix   — детерминистические патчи OOXML (multipleSpaces, doubleDots, noUnderline, noColoredText)
  ↓  7. Suggest    — для остальных неуспешных проверок — LLM-suggestion (без применения)
output.docx + QualityReport
```

### Ключевые решения

1. **LLM никогда не пишет OOXML.** Заголовки, TOC, нумерация, поля страницы, формулы — всё детерминистически через Pandoc `--reference-doc`. LLM участвует максимум в переписывании абзацев body (и то опционально).

2. **Pandoc primary, docxtpl fallback.** Простые таблицы собираются Pandoc'ом из pipe-markdown; merged-cell таблицы (детектор в `assembler/docxtpl.ts:detectTableComplexity`) зарезервированы под docxtpl (сам wrapper готов, route not yet wired into orchestrator).

3. **Images через `--resource-path`.** Mammoth пишет картинки во временную директорию, markdown ссылается на них по имени файла, pandoc embed'ит через `--resource-path=<tmpdir>`. Плюс backfill неразмеченных media (headers/footers/VML) как `Приложение Б. Дополнительные изображения`.

4. **Tables как pipe-markdown.** Mammoth'овый `convertToMarkdown` молча теряет `<table>`, а pandoc'овский docx-writer выбрасывает raw HTML. Вытаскиваем таблицы из OOXML отдельно (`extractTablesFromXml`) и рендерим pipe-style в `Приложение А. Таблицы`.

5. **Heading promotion.** Если в исходнике нет h1/h2 (автор применял direct formatting вместо стилей), pandoc `--toc` не сгенерирует TOC. Промоутим глубочайший использованный уровень до h1.

6. **TOC title `СОДЕРЖАНИЕ`.** Через `--metadata toc-title=СОДЕРЖАНИЕ`. Checker умеет ходить внутрь `<w:sdt><w:sdtContent>` (pandoc оборачивает TOC в SDT), поэтому находит заголовок содержания.

## Структура каталогов

```
pipeline-v6/
├── README.md
├── orchestrator.ts        — главный runPipelineV6(buffer, opts) → PipelineResult
├── feature-flag.ts        — NEXT_PUBLIC_USE_PIPELINE_V6 / allowlist / cookie / query
│
├── extractor/
│   └── mammoth-extractor.ts   — docx → markdown + html + images + tables
│                                 (ExtractOptions.imageDir: пишет картинки на диск с
│                                  нормализованными расширениями — x-wmf → wmf)
│
├── analyzer/
│   └── structure-analyzer.ts  — считает h1/h2/h3, route: preserve/heuristic/llm-full
│
├── rewriter/
│   └── body-rewriter.ts       — slot-based LLM rewrite (только body, gated через schema-adapter)
│
├── schema/
│   └── ...                    — Zod → gemini/openai/anthropic format adapter
│
├── assembler/
│   ├── pandoc.ts              — child_process обёртка над pandoc CLI
│   │                             (timeout 90s, --toc, --resource-path, --metadata, --reference-doc)
│   └── docxtpl.ts             — Python bridge для сложных merged-cell таблиц + detectTableComplexity
│
├── bibliography/
│   └── gost-formatter.ts      — ГОСТ 7.1 formatter без citation-js
│                                 (book/article/chapter/webpage/thesis)
│
├── checker/
│   └── index.ts               — runQualityChecks(rawBuf, fmtBuf, enriched|undefined, id, rules)
│                                 → QualityReport с 30 правилами (text/headings/structure/preservation/...)
│
└── fix-suggest/
    └── fix-loop.ts            — planFixes, applyAutoFixesToXml, summariseSuggestions
                                  auto-fix: multipleSpaces (paragraph-scoped),
                                  doubleDots (within + cross-run), noUnderline, noColoredText
```

## Бенч

- Golden: 19 документов в `data/golden/` (manifest коммитится, .docx — нет)
- Checker report: `bench-reports/v6/v6-2026-04-21.json`
- Текущий avg: **100.0** (baseline 76, delta **+24.0**)
- CLI: `npx tsx scripts/pipeline-v6/measure-delta.ts 19 --save`
- Top-failures: `npx tsx scripts/pipeline-v6/top-failures.ts`

## API endpoint

Beta изолирован от прод `/api/process-gost`:
- `POST /api/process-v6` — принимает upload, возвращает docx + QualityReport
- Feature-flag `NEXT_PUBLIC_USE_PIPELINE_V6` + allowlist в `feature-flag.ts`

## Зависимости

- [src/lib/xml/docx-xml.ts](../xml/docx-xml.ts) — OOXML parser (переиспользуется; в этой сессии добавили walk в `<w:sdt>` в `getParagraphsWithPositions`)
- [src/lib/ai/gateway.ts](../ai/gateway.ts) — `callAI()` с multi-provider routing
- Pandoc 3.x CLI (через `child_process`; на Vercel — bundle через layer, TBD)
- (опционально) Python + docxtpl для сложных таблиц — пока не wired в orchestrator

## Что ещё не сделано (post-MVP)

- docxtpl route для merged-cell таблиц (wrapper готов, orchestrator пока все таблицы отдаёт pandoc'у)
- Bibliography integration в orchestrator (парсинг цитат, feed в gost-formatter)
- Body rewriter integration-тест с живым LLM (сейчас только dry-run)
- Fix baseline ID match в `measure-delta.ts` (manifest использует `source_document_id`, файлы — `job_id`)
- Deploy Pandoc на Vercel (Lambda layer / bundled binary)
- Переключить прод трафик на v6 после A/B на реальных jobs
