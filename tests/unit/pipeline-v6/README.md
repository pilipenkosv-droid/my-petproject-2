# pipeline-v6 unit tests

Тесты для [src/lib/pipeline-v6/](../../../src/lib/pipeline-v6/). Vitest, паттерн как в `tests/unit/pipeline-v5/` (удалён в Неделе 1).

## План тестов по неделям

| Неделя | Тесты |
|---|---|
| 1 | `checker/*.test.ts` — каждое правило ГОСТ на синтетическом OOXML (margins, headings, TOC, …) |
| 2 | `extractor/*.test.ts`, `assembler/pandoc.test.ts` (smoke на pandoc CLI), `structure-analyzer.test.ts` |
| 3 | `body-rewriter.test.ts` (mock AI Gateway), end-to-end `pipeline.test.ts` на 1 golden-doc |
| 4 | Регрессии на полном golden dataset через `scripts/pipeline-v6/run-checker.ts` |
