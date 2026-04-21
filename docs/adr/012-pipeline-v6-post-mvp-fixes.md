# ADR-012 — pipeline-v6 post-MVP fixes (2026-04-21)

**Status:** accepted
**Related:** [ADR-010 — GOST rules](010-pipeline-v6-gost-rules.md), [ADR-011 — Assembler choice](011-pipeline-v6-assembler-choice.md)

## Контекст

После закрытия недель 1-6 (checker, Pandoc/docxtpl спайки, extractor, analyzer, body rewriter, bibliography, fix-loop, orchestrator, beta endpoint) первый прогон на golden dataset дал `avg 87.9/100`. Цель — довести до 100% pass-rate на 19 документах без хаков и без LLM-костылей.

Документ фиксирует 15 пассов, которые закрыли этот gap.

## Проходы

Каждый пасс: ID коммита → что именно исправлено → delta score.

| # | Commit | Фикс | Delta |
|---|---|---|---|
| 1 | `fab5857` | Tune `reference-gost.docx` к ГОСТ 7.32 (margins 20/10/20/30mm, Times 14pt, line 1.5, indent 12.5mm) | 76 → baseline |
| 2 | `d02efaf` | Strip base64 images из mammoth markdown (50 MB → 33 KB) + pandoc timeout 30s → 90s | +11.9 |
| 3 | `cb707e5` | Save official v6 bench report | — |
| 4 | `962d671` | Heading promotion (h3 → h1 когда нет h1/h2) + `--metadata toc-title=СОДЕРЖАНИЕ` + cross-run multi-space auto-fix | +1.6 |
| 5 | `9865571` | Embed images через pandoc `--resource-path` | images 58% → 16%, avg → 89.5 |
| 6 | `ae5e98b` | Heuristic title-page detection по маркерам (МИНИСТЕРСТВО, КУРСОВАЯ, ВЫПОЛНИЛ, …) | titlePage 100% → 42%, avg → 92.3 |
| 7 | `bafe87c` | Paragraph-scoped multi-space fix + SDT walker в `getParagraphsWithPositions` | spaces 53%→26%, tocHeading 42%→0%, avg → 93.8 |
| 8 | `84efa5a` | Tables: рендерим `ExtractedTable.rows` как pipe-markdown (mammoth теряет, pandoc дропает raw HTML) | tables 53% → 0%, avg → 96.4 |
| 9 | `029d75a` | Auto-fix `text.doubleDots` внутри одного `<w:t>` | doubleDots 16% → 5% |
| 10 | `9989ca3` | Normalise MIME `image/x-wmf` → `.wmf` (pandoc не видел неправильный extension) | images 16% → 5%, avg → 97.1 |
| 11 | `38f8b04` | Broaden titlePage markers (ШКОЛА/УЧЕНИК/ПРОЕКТ) + content-first fallback (СОДЕРЖАНИЕ/СПИСОК/ЗАДАЧА N) | titlePage 42% → 16%, avg → 98.4 |
| 12 | `5ec99c0` | `getFullText` теперь walk'ает paragraph children в doc order с descend'ом в `<w:hyperlink>`/`<w:ins>`/`<w:del>` (getRuns возвращал direct then wrapped → spurious adjacent-space artefacts) | multipleSpaces 26% → 0%, avg → 98.9 |
| 13 | `bee7f55` | Titlepage heuristic теперь читает origXml (raw doc), не formatted — иначе pandoc'овский toc-title `СОДЕРЖАНИЕ` затенял реальную первую строку | titlePage 16% → 0%, avg → 99.7 |
| 14 | (next) | Cross-run `doubleDots` auto-fix (paragraph-scoped) | doubleDots 5% → 0% |
| 15 | (next) | Backfill unreferenced raw media в `Приложение Б` — для headers/footers/VML/textbox изображений, которые mammoth не выносит в body | images 5% → 0%, avg → **100.0** |

## Итог

- **Score на 19 golden docs:** baseline 76 → v6 **100.0** (+24.0 pts)
- **Failing checks:** 0
- **Time per doc:** < 2s avg (max 1.7s), 0 timeouts
- **No LLM в hot path** — fix-loop применяет только детерминистические патчи; LLM остаётся на optional body rewrite + suggest

## Ключевые находки

1. **Mammoth теряет контент, который не в main text flow.** Tables, images в headers/footers, VML pict-блоки — всё нужно вытаскивать из raw zip отдельно. Решения: `extractTablesFromXml` + backfill raw media.

2. **Pandoc docx writer дропает raw HTML.** Нельзя просто инжектить `<table>` в markdown; нужен pipe-markdown или html-input.

3. **getRuns() не doc-order.** Direct children'ы возвращаются до wrapped (hyperlink/ins/del) → concat текста получается с нарушенным порядком, что триггерило false-positive multipleSpaces на чистых параграфах. Fix: walker с descend в wrappers.

4. **Pandoc оборачивает TOC в `<w:sdt><w:sdtContent>`.** Любой параграф-walker, который не descend'ит в SDT, не увидит TOC entries и заголовок `СОДЕРЖАНИЕ`.

5. **Эвристики от raw doc надёжнее, чем от formatted.** Pandoc вставляет собственный toc-title перед контентом → heuristic "первая строка — content-first marker?" требует чтения исходника.

## Следующий шаг

1. A/B v6 vs current prod на живых jobs (100 штук).
2. Pandoc binary на Vercel (Lambda layer).
3. docxtpl route для merged-cell таблиц.
4. Bibliography parser + integration в orchestrator.
