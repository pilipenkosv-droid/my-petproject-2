# Разметка ролей абзацев (gold labels) — как это работает

Три скрипта, `data/golden/labels-work/` (черновик, с текстом, в git не идёт) →
`data/golden/labels/` (финал, без текста, коммитится).

## 1. Экспорт (владелец, локально — реальные docx не читает Claude Code)

```bash
npx tsx scripts/pipeline-v7/labels-export.ts --dir=data/corpus/real
```

Прогоняет T0 (`classifyDocument`) по каждому `.docx` в директории и пишет
`data/golden/labels-work/<id>.csv` — по строке на абзац: индекс, первые 120
символов текста, ключевые признаки T0 (`styleId`, `boldAll`, `capsRatio`,
`jc`, `sz`, `numPr`, `keepNext`, `inTable`), роль и уверенность T0, и колонку
`gold` — предзаполнена ролью T0.

В консоль печатается ранжирование документов по числу `unknown` +
low-confidence абзацев (только id и счётчики, без текста) — с них начинать
разметку. Один файл:

```bash
npx tsx scripts/pipeline-v7/labels-export.ts --file=data/corpus/real/<id>.docx
```

## 2. Правка

Открыть `data/golden/labels-work/<id>.csv` (Excel/Numbers/Google Sheets) и
поправить колонку `gold` там, где T0 ошибся. Строки, где `gold` совпадает с
`t0_role`, можно не трогать. Пустой `gold` при импорте считается «оставить
как T0».

## 3. Импорт

```bash
npx tsx scripts/pipeline-v7/labels-import.ts --dir=data/golden/labels-work
```

Валидирует `gold` против списка ролей (`Role` в `classify/types.ts`) и
пишет `data/golden/labels/<id>.json`: `{ documentId, source: "manual",
createdAt, labels: [{ i, role }] }` — без текста, коммитится. Файл с хотя бы
одной невалидной строкой не пишется, ошибки печатаются построчно (id
строки, без текста).

## 4. Метрика

```bash
npx tsx scripts/pipeline-v7/bench-roles.ts
npx tsx scripts/pipeline-v7/bench-roles.ts --llm   # см. предупреждение ниже
```

Для каждого файла в `data/golden/labels/` находит исходный `.docx` (по
умолчанию ищет в `data/corpus/real/` и `data/corpus/synthetic/`), заново
прогоняет T0 и — с флагом `--llm` — LLM-остаток
(`classifyResidueWithLlm`), сравнивает с gold и печатает: accuracy,
per-role precision/recall, confusion matrix (только несовпадения),
долю `unknown`. Отдельно для T0-only и, если запрошено, T0+LLM.

`--llm` **выключен по умолчанию** и предупреждает при включении: он вызывает
прод-путь LLM-классификации через Vercel AI Gateway (Gemini) и тратит
бесплатную квоту. При 429 не переключаться на платного провайдера — см.
`.claude/rules/llm-quota-fallback.md`.

## Формат labels-файла

```json
{
  "documentId": "abc123",
  "source": "manual",
  "createdAt": "2026-09-19T12:00:00.000Z",
  "labels": [{ "i": 0, "role": "title_page" }, ...]
}
```

`i` — индекс абзаца в порядке `ClassificationResult.list` (тот же, что в
CSV на экспорте). Список ролей — `Role` в
`src/lib/pipeline-v7/classify/types.ts` (17 значений, включая позиционные
`table_cell`/`note`/`header_footer`/`formula`/`empty`, которые T0 решает
сам и LLM не видит).
