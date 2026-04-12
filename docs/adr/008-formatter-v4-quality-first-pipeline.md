# ADR-008: Formatter v4 — Quality-First Pipeline с мультимодельной маршрутизацией

**Дата**: 2026-04-12
**Статус**: Planned
**Автор**: Claude Code deep research session

## Context

Formatter v3 набирает 95/100 на quality bench, но имеет 9 системных проблем, выявленных при deep research и тестировании на реальных документах. Главная цель v4 — качество близкое к идеалу, как если бы человек, знающий ГОСТ, правил документ вручную.

## Проблемы v3

1. **Per-run formatting loss** — `applyTextFixesToXmlParagraph()` мержит все runs в первый `w:t`, уничтожая bold/italic/underline. Тот же баг в bibliography formatter. Файлы: `text-fixes-xml-formatter.ts:153–192`, `bibliography-xml-formatter.ts:122–143`
2. **0–15% unknown blockType** — нет fallback-логики, нет валидации последовательностей блоков
3. **Одна модель на всё** — Gemini 2.5 Flash для всех чанков, хотя ~25% можно разметить rule-based, а ~10% требуют reasoning (Pro)
4. **Нет post-format верификации** — пайплайн не проверяет корректность результатов
5. **Сквозная нумерация списков** — списки продолжают счёт через heading-границы вместо сброса per-section
6. **Landscape таблицы** — caption и таблица на разных страницах; пустые страницы после landscape секций
7. **Bibliography mixing** — regex `BIBLIO_TITLE_PATTERNS` не покрывает "использованной", bibliography items попадают в обычные list groups
8. **Multiline headings** — merge ловит только 1 continuation, пропускает uppercase, 3-part headings, пустые абзацы между частями
9. **TOC не последний** — формируется до landscape formatter, может не отразить финальную структуру

## Decision

### Архитектура

- **Локальный стенд** (`scripts/pipeline-standalone.ts`) для экспериментов → **VPS worker** для продакшена
- **4-тировая мультимодельная маршрутизация**: T0 (rule-based, $0) → T1 (Flash Lite, $0.10) → T2 (Flash, $0.30) → T3 (Pro, $1.25)
- **Cascade fallback**: T1→T2→T3 при высоком % unknown
- **Validation critic**: sequence rules + confidence-based retry + style fallback
- **Semantic pre-pass** (экспериментально): LLM анализирует чистый текст для heading continuation и caption-table association
- **VPS backend**: без ограничений по времени, основная логика на VPS, Vercel — thin route

### 4 тира моделей

| Tier | Модель | $/1M input | Доля | Для чего |
|------|--------|-----------|------|----------|
| T0 | Rule-based | $0 | ~25% | empty, page_number, Word-styled headings |
| T1 | Gemini 2.5 Flash Lite | $0.10 | ~35% | body_text, list_items, obvious captions |
| T2 | Gemini 2.5 Flash | $0.30 | ~30% | смешанные чанки, ambiguous текст |
| T3 | Gemini 2.5 Pro | $1.25 | ~10% | bibliography, title page, appendix |

### Стоимость (100 стр документ)

- v3 (всё Flash): $0.135
- v4 (4 тира): $0.055 (**–59%**)
- При этом качество ВЫШЕ за счёт Pro на сложных чанках

### SuperDoc Document Engine

Исследован как потенциальная замена нашего XML-formatter. **Решение: не использовать сейчас**, мониторить.
- Open source (AGPLv3), коммерческая лицензия $499
- 180+ MCP tools для .docx манипуляции
- Headless process, может работать на VPS рядом с нашим worker
- Потенциально полезен для: landscape sections, list numbering, TOC (те области где у нас баги)
- Миграция слишком рискованна — 977 строк working XML code
- Может пригодиться для online document editor в будущем

### Фазы реализации

- **Фаза A** (3–4 дня): Standalone CLI + все 8 критических фиксов → quality ≥97
- **Фаза B** (2 дня): 4-tier routing + cost tracking → quality ≥98, cost –59%
- **Фаза C** (1 день): Semantic pre-pass (experimental) → quality ≥99 на сложных документах
- **Фаза D** (1 день): VPS worker + Vercel integration
- **Фаза E** (0.5 дня): Feature flag + A/B + production rollout

## Consequences

- Quality target: 95/100 → ≥98/100 (≥99 на сложных документах с semantic pre-pass)
- Cost: –59% per document
- Latency: без ограничений (VPS), но оптимизируем через parallel batches
- Architecture: pipeline logic decoupled от Next.js/Vercel — можно запускать anywhere
- Maintainability: typed state machine вместо 8 sequential function calls

## Alternatives Considered

- **LangGraph/CrewAI** — overkill для <300с синхронного пайплайна, нет persistence requirements
- **SuperDoc MCP** — рискованная миграция, наши конкретные баги имеют конкретные фиксы
- **Claude/GPT вместо Gemini** — дороже, нет native JSON schema enforcement на уровне API
- **DeepSeek** — слишком медленный (38 tok/s), маленький контекст (128K)

## Research Sources

- Harvey AI blog: "Building an Agent for Complex Document Drafting and Editing"
- CrewAI: "Agentic Systems" (1.7B workflows data)
- Docling (IBM, 37K stars): document AST representation
- SuperDoc Document Engine: 180+ MCP tools for .docx
- Google Gemini pricing (April 2026)
- Reflection pattern: +18.5pp accuracy (78.6% → 97.1%)
- RouteLLM (ICLR 2025): model routing research
