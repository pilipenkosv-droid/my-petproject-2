# Session Summary: Formatter v4 Deep Research (2026-04-12)

## Что было сделано

### 1. Deep Research — мировые практики форматирования документов

Исследованы:
- **Harvey AI** — юридический AI для .docx, отказались от python-docx в пользу прямой XML-манипуляции. Ключевой паттерн: reduced XML representation для LLM + sub-agent параллелизм по секциям
- **CrewAI** — 12M+ executions/day, философия: "deterministic backbone + intelligence where it matters"
- **LangGraph** — stateful multi-agent graphs, supervisor pattern. Вердикт: overkill для нашего <300с пайплайна
- **Reflection pattern** — Generate→Critique→Revise, документированный +18.5pp accuracy
- **Docling (IBM, 37K stars)** — document AST, но заточен под extraction, не formatting
- **SuperDoc Document Engine** — 180+ MCP tools для .docx, open source AGPLv3/$499 commercial

### 2. Анализ текущего пайплайна

Полный code review всех форматтеров:
- `xml-formatter.ts` (977 строк) — основной, корректно работает per-run
- `text-fixes-xml-formatter.ts` — **критический баг**: мержит все runs в первый `w:t`
- `bibliography-xml-formatter.ts` — тот же баг
- `list-formatter.ts` — сквозная нумерация через heading-границы
- `table-landscape-formatter.ts` — caption на другой странице от таблицы
- `document-cleanup-formatter.ts` — неполное слияние multiline headings
- `toc-generator.ts` — формируется не последним шагом

### 3. Модели — cost/quality анализ

| Модель | $/1M input | $/1M output | Verdict |
|--------|-----------|------------|---------|
| Gemini 2.5 Flash Lite | $0.10 | $0.40 | T1: простые чанки |
| Gemini 2.5 Flash | $0.30 | $1.00 | T2: стандартные (текущий) |
| Gemini 2.5 Pro | $1.25 | $10.00 | T3: сложные (bibliography, title page) |
| GPT-4.1 mini | $0.40 | $1.60 | Не нужен — Gemini дешевле |
| Claude Sonnet 4.6 | $3.00 | $15.00 | Слишком дорого для classification |
| DeepSeek V3 | $0.014 | $0.028 | Слишком медленный (38 tok/s) |

### 4. Async Architecture

- Vercel Pro + Fluid Compute позволяет `maxDuration` до 800с (сейчас стоит 60)
- Решение: VPS worker для тяжёлых процессов, Vercel — thin route
- Инфраструктура для polling уже есть (job-store, file-storage, `/api/status/[jobId]`)

### 5. SuperDoc Document Engine

- Open source (AGPLv3), $499 коммерческая лицензия
- 554 stars, 5157 commits, TypeScript
- Headless process через CLI (`superdoc host --stdio`)
- Node.js SDK для programmatic access
- **Решение**: не использовать сейчас для форматирования (миграция рискованна), но:
  - Мониторить для сложных операций (landscape, lists, TOC)
  - Потенциально использовать для online document editor (браузерный просмотр с пометками)
- **Открытый вопрос**: проверить SuperDoc API на поддержку landscape sections, per-section list numbering, inline comments/annotations

### 6. Выявленные проблемы (всего 9)

1. Per-run formatting loss (bold/italic уничтожаются)
2. 0–15% unknown blockType без fallback
3. Одна модель на всё
4. Нет post-format верификации
5. Сквозная нумерация списков
6. Landscape caption на другой странице + пустые страницы
7. Bibliography mixing с обычными списками
8. Multiline headings — неполное слияние
9. TOC формируется не последним

## Что НЕ было сделано (осталось на следующую сессию)

1. **SuperDoc API проверка** — нужно изучить конкретные tools для landscape, lists, annotations
2. **Online document editor feasibility** — SuperDoc как браузерный редактор для показа результатов с пометками
3. **Реализация** — план готов (ADR-008), код не написан

## Артефакты

| Файл | Описание |
|------|----------|
| `docs/adr/008-formatter-v4-quality-first-pipeline.md` | ADR с полным описанием решений |
| `.claude/plans/groovy-crafting-hopper.md` | Детальный план реализации с кодом |
| `docs/session-2026-04-12-formatter-v4-research.md` | Этот файл — саммари сессии |

## Ключевые решения

1. **Quality first** — качество как абсолютный приоритет, время/стоимость вторичны
2. **VPS backend** — без ограничений по времени, Vercel только для фронтенда
3. **4-tier model routing** — T0 (rule), T1 (Flash Lite), T2 (Flash), T3 (Pro)
4. **Cascade fallback** — T1→T2→T3 при проблемах
5. **Semantic pre-pass** (experimental) — LLM анализирует чистый текст для heading continuation
6. **SuperDoc** — мониторить, не мигрировать. Потенциал для online editor.

## Для продолжения

Начинать с **Фазы A** (plan file: `.claude/plans/groovy-crafting-hopper.md`):
1. `scripts/pipeline-standalone.ts` — CLI стенд
2. Per-run text fix
3. List per-section нумерация
4. Landscape caption fix
5. Bibliography isolation
6. Multiline heading merge v2
7. TOC последним
8. Markup validator

Прогнать quality bench после каждого фикса, цель ≥97/100 после фазы A.
