# pipeline-v6

Template-first formatting pipeline для дипломов по ГОСТ 7.32. Замена pipeline-v5 (scaffold, не выходил в прод) и текущего активного стека `src/lib/formatters/*` после полного перехода.

Стратегия: [vault/.../2026-04-21-diplox-formatting-strategy-v2.md](../../../../Second%20brain/vault/thoughts/projects/2026-04-21-diplox-formatting-strategy-v2.md).

## Принципы

1. **Template-first.** Pandoc + `reference-doc=gost.docx` → детерминистическая генерация заголовков, TOC, OMML-формул. LLM никогда не пишет OOXML.
2. **Decoupled content/format** (SLOT, Deco-G). LLM решает либо content, либо suggestion — не оба сразу.
3. **Grammar-constrained, не prompted.** Все структурные выходы LLM ограничены Zod через единый schema-adapter (Step 4).
4. **Detect deterministic, fix-suggest LLM.** 46 правил ГОСТ 7.32 — TS-функции (`checker/rules/`). LLM зовём только когда правило нарушено.
5. **Reuse mature open-source.** Pandoc, docxtpl, Citation.js, Docling. Не переписываем работающее.
6. **Adaptive complexity для ассетов.** Простые таблицы → Pandoc/Markdown, сложные → docxtpl с OOXML cell template.
7. **Measure everything.** Golden dataset (`data/golden/`) + automated checker (`checker/`) + LLM-as-judge.

## Структура

```
pipeline-v6/
├── README.md            — этот файл
├── checker/             — детерминистический GOST validator
│   ├── index.ts         — runChecks(buffer) → QualityReport
│   ├── types.ts         — CheckResult, QualityReport, CheckSeverity
│   └── rules/           — 46 правил ГОСТ 7.32 как отдельные функции
├── extractor/           — [Неделя 2] mammoth.js → AST + Markdown + assets JSON
├── assembler/           — [Неделя 2] Pandoc CLI runner + docxtpl bridge
├── stages/              — [Неделя 2-3] orchestration (structure, body, bibliography, captions, validate)
└── feature-flag.ts      — [Неделя 4] NEXT_PUBLIC_USE_PIPELINE_V6 routing
```

## Roadmap

| Неделя | Содержимое |
|---|---|
| 1 (текущая) | Этот scaffold, checker/, golden dataset, Pandoc/docxtpl spike → ADR-011 |
| 2 | Extractor, Assembler, Citation.js (ГОСТ 7.1 CSL), Structure Analyzer (Stage 0), Schema Adapter (Step 4) |
| 3 | Body Rewriter (grammar-constrained), Fact-check, первые 10 правил validator end-to-end |
| 4 | Fix-suggest LLM loop, оставшиеся 36 правил, feature-flag rollout |

## Зависимости

- [src/lib/xml/docx-xml.ts](../xml/docx-xml.ts) — OOXML parser (переиспользуется)
- [src/lib/ai/gateway.ts](../ai/gateway.ts) — `callAI()` с multi-provider routing (переиспользуется, multimodal добавляется в неделе 2)
- [src/lib/ai/schemas.ts](../ai/schemas.ts) + `semantic-schemas.ts` + `block-markup-schemas.ts` — Zod-схемы (переиспользуются после Step 4)
- Pandoc 3.x CLI (через `child_process` на Vercel)
- (опционально) Python + docxtpl для сложных таблиц
