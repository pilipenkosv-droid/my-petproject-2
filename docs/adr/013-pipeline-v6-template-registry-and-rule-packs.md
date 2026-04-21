# ADR-013 — pipeline-v6 Template Registry + Rule Packs

**Status:** proposed
**Related:** [ADR-010 — GOST rules](010-pipeline-v6-gost-rules.md), [ADR-011 — Assembler choice](011-pipeline-v6-assembler-choice.md), [ADR-012 — post-MVP fixes](012-pipeline-v6-post-mvp-fixes.md)

## Контекст

Pipeline-v6 (на 2026-04-21) работает только с ГОСТ 7.32:

- `reference-gost.docx` — один файл, margins/font/spacing прошиты
- `DEFAULT_GOST_RULES` — один набор значений для checker'а
- 30 правил `checker/index.ts` — hardcoded под ГОСТ-специфику (TOC title "СОДЕРЖАНИЕ", маркеры титульной страницы, разрыв секции)

Пользователи же приносят методички разных вузов (МГУ, ВШЭ, МФТИ, МГТУ им. Баумана, региональные), каждая со своими требованиями: margins, шрифт, нумерация, TOC title, правила оформления bibliography, подписи к рисункам. Многие отличия — не добавление новых правил, а _другие значения_ для тех же (поля 25/15/25/10 вместо 30/20/20/10, Arial 12pt вместо Times 14pt).

Нужен механизм, который позволит студенту указать методичку (из каталога или через upload эталонного .docx), а pipeline пересоберёт и проверит документ по её правилам.

## Решение

Два слабо связанных абстракционных слоя.

### 1. TemplateRegistry — каталог .docx шаблонов

Директория в репо + таблица в БД:

```
templates/
├── gost-7.32.docx           (текущий reference-gost.docx)
├── vshe-diploma-2024.docx
├── mgu-curs-2023.docx
├── mfti-diploma-2025.docx
└── ...
```

Таблица `formatting_templates`:

| column | type | note |
|---|---|---|
| id | uuid | |
| slug | text | `gost-7.32`, `vshe-diploma-2024` |
| name | text | "ГОСТ 7.32", "ВШЭ 2024 Диплом" |
| university | text nullable | |
| reference_doc_path | text | относительный путь к .docx в репо / Supabase storage |
| rule_pack_id | uuid | FK |
| visibility | enum (public, pro_only, private) | |
| created_at | timestamp | |

В orchestrator передаём `templateSlug`, он ресолвится в `reference_doc_path` + `rule_pack_id` и дальше как сейчас.

### 2. RulePack — сериализуемый набор правил

Rule pack = JSON с тремя секциями:

```ts
interface RulePack {
  id: string;
  slug: string;       // 'gost-7.32', 'vshe-diploma-2024'

  // секция A: значения, которыми параметризуются существующие 30 правил
  values: {
    margins: { top: mm; bottom: mm; left: mm; right: mm };
    fontFamily: string;
    fontSize: pt;
    lineSpacing: number;
    paragraphIndent: mm;
    tocTitle: string;              // "СОДЕРЖАНИЕ" / "ОГЛАВЛЕНИЕ" / "CONTENTS"
    bibliographyStyle: 'gost-7.1' | 'apa-7' | 'chicago-17';
    headingNumbering: 'gost' | 'decimal' | 'alpha' | 'none';
  };

  // секция B: какие из 30 existing-правил активны
  enabled: string[];               // ['text.fontFamily', 'text.fontSize', ...]

  // секция C: кастомные правила для этой методички
  custom: CustomRule[];
}

interface CustomRule {
  id: string;                      // 'vshe.tablecaption-position'
  category: string;
  severity: CheckSeverity;
  // rule body как узкий DSL, а не произвольный JS — безопасно сериализуется
  // и не требует деплоя для обновления
  detector: RuleDetector;
}

type RuleDetector =
  | { kind: 'paragraph-text-regex'; pattern: string; flags?: string; expect: 'match' | 'no-match' }
  | { kind: 'paragraph-style-equals'; style: string }
  | { kind: 'numbered-caption-position'; objectType: 'table' | 'figure'; position: 'above' | 'below' }
  | ... // расширяемый union
```

**Почему DSL, а не функции:**

- Правил будет много (N университетов × M правил каждый), писать каждое в TS — не масштабируется
- Обновление методички не должно требовать deploy (пользователи pro-плана смогут заливать свои rule packs через UI)
- Детерминизм: детекторы описаны узко и читаются ревьюером
- Сложные правила, которые DSL не покрывает, остаются в `checker/rules/*.ts` и регистрируются в `enabled` под своим id

Существующие 30 правил рефакторятся — параметры вычитываются из `rules.values` вместо hardcoded констант.

### 3. Orchestrator API

```ts
runPipelineV6(input, {
  documentId,
  templateSlug: 'vshe-diploma-2024',   // ← новое
  // или:
  customTemplate: { referenceDoc: Buffer, rulePack: RulePack },  // ← upload эталона
  metadata,
  fixIterations,
})
```

Внутри:

1. Resolve `templateSlug` → `{ referenceDocPath, rulePack }` из registry
2. Assemble с `reference-doc=<referenceDocPath>` + `--metadata toc-title=<rulePack.values.tocTitle>`
3. Checker с `rulePack` (вместо `DEFAULT_GOST_RULES`)
4. Auto-fix loop — auto-fix'ы детерминистически универсальны (multipleSpaces, doubleDots и пр. работают на любой методичке)

### 4. UI / UX

В constructor добавляем step "Методичка":

1. Выбор из каталога (фильтр по вузу, дефолт "ГОСТ 7.32")
2. Upload: студент прикладывает методичку в .docx → pipeline парсит first-page styles, margins, шрифт; предлагает сохранить как приватный template (only для Pro). MVP: только выбор из каталога.

### 5. Методичка-as-docx parsing (фаза 2)

Когда пользователь уплоадит эталон:

1. Извлекаем `styles.xml`, `document.xml` sectPr → автоматически получаем `margins`, `fontFamily`, `fontSize`, `lineSpacing`
2. Эвристика по content: если где-то встречается "ОГЛАВЛЕНИЕ" на первой странице после титула → `tocTitle='ОГЛАВЛЕНИЕ'`
3. Результат → черновик RulePack, студент подтверждает / редактирует через форму в UI

## Миграция

**Фаза 1 (1-2 дня)** — рефакторинг без пользовательского UI:

- [ ] Создать таблицу `formatting_templates` + seed одной строкой (`gost-7.32`)
- [ ] Создать `RulePack` type + `GOST_7_32` pack с текущими значениями
- [ ] Параметризовать 30 checker-правил через `rulePack.values`
- [ ] orchestrator: принимать `templateSlug` (default `gost-7.32`, поведение не меняется)
- [ ] Тест: все 19 golden docs остаются на 100.0

**Фаза 2 (2-3 дня на методичку)** — добавление vshe-diploma-2024:

- [ ] Собрать `templates/vshe-diploma-2024.docx` через `tune-reference-doc.ts` по PDF методички
- [ ] Прописать `RulePack` (большинство полей — копия GOST, меняются только `margins`/`fontSize`/`tocTitle`)
- [ ] Добавить 0-5 кастомных правил (если методичка требует)
- [ ] Собрать 5-10 golden docs именно под эту методичку, замерить
- [ ] UI: переключалка в constructor

**Фаза 3 (post-launch)** — self-service upload:

- [ ] Parser методички-as-docx → черновик RulePack
- [ ] Форма редактирования RulePack для Pro
- [ ] Приватные templates per-user

## Альтернативы, которые отвергнуты

1. **Один мега-template с conditional styles через Jinja.** Даёт один файл, но resource-doc в pandoc не поддерживает conditionals. Отпадает.
2. **Писать каждый университетский template как полный набор checker-функций.** Не масштабируется: 50 вузов × 30 правил = 1500 функций. DSL-based custom rules решают это.
3. **LLM-based classifier "соответствует ли абзац методичке".** Недетерминистично, дорого, в разрез с принципом "detect deterministic, fix-suggest LLM".

## Риски

1. **Interoperability с существующим `formatting-rules.ts`.** Его уже импортирует 30+ мест в codebase. Фаза 1 должна сохранить backwards-compatibility — старый `DEFAULT_GOST_RULES` остаётся, просто становится одним из seed'ов `RulePack.values`.
2. **Custom rule DSL растёт** быстрее, чем предусмотрено. Решение: оставить escape hatch — sub-type `{ kind: 'legacy-ts'; fnId: string }` со ссылкой на функцию в `checker/rules/legacy/*.ts`. Деплой нужен, но не блокирует.
3. **Автопарсинг методички** может выдавать хрупкие RulePack'и (особенно для методичек, которые сами кривые). Решение: фаза 3, а не MVP. В MVP — ручной curated каталог.

## Acceptance

Фаза 1 считается done когда:

- `runPipelineV6(..., { templateSlug: 'gost-7.32' })` даёт тот же docx и ту же `QualityReport`, что текущий v6 без параметра
- `npx tsx scripts/pipeline-v6/measure-delta.ts 19` остаётся на **avg 100.0**
- Unit-тесты показывают, что передача `rulePack` с изменённым `fontSize` ломает соответствующий check и ничего больше

Фаза 2 done когда:

- `runPipelineV6(..., { templateSlug: 'vshe-diploma-2024' })` на 5 ВШЭ-документах даёт **avg >= 90** и 0 critical failures
