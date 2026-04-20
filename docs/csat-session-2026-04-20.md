# CSAT Recovery Session — 2026-04-19/20

Сводка работ по фиксу CSAT-проблем форматтера за два дня.

## Контекст

CSAT 30d до 2026-04-19: **2.2 средний рейтинг, 62% доля 1★** (17 из 27). Главный кластер комментариев на 1★ — «ничего не исправлено».

## Что сделано

### Round 1 — формальная разметка (2026-04-19, commit `330935d`)

Три-компонентный фикс силового применения форматирования:

- **`src/lib/formatters/post-pass-enforcer.ts`** — финальный проход по всем `w:p` (включая вложенные в таблицы): H1/pageBreakBefore/center/bold + body_text=both + cross-run multi-space collapse.
- **`src/lib/formatters/table-cells-formatter.ts`** — шрифт/размер/выравнивание параграфов внутри `w:tc`.
- **`src/lib/ai/rule-based-block-classifier.ts`** — fallback при rate-limit AI: `ВВЕДЕНИЕ→heading_1`, `\d+\.\d+→heading_2`, list markers, `Рисунок/Таблица→captions`.
- **`src/lib/formatters/xml-formatter.ts`** — `applyPageMargins` обходит все `w:sectPr`.
- Observability: `fixesApplied`, `unknownBlockRatio` в `jobs.statistics`.

Pre-deploy validation на golden bench: `RIEU4mlQ0urdqG8pS5aBE` (383 viol→1★) = 100/100; `uoi7jdZW-nmVLH6WZZ32v` (759 viol, 267 unknown→1★) = 100/100.

### Round 2 — thinking budget + timeout (2026-04-20, commit `87218f1`)

**Реальная корневая причина** (по CSV Vercel AI Gateway, 329 запросов):
- Reasoning tokens p50=2115, p95=7862 — параметр `thinking.budget_tokens: 1024` НЕ уважался (неверный синтаксис для openai-compat).
- Latency p50=13s, p95=39.5s — наш `AI_CALL_TIMEOUT_PAID_MS=15s` резал ~50% запросов в silent fallback на `blockType: "unknown"`.
- 3 RPM при потолке 300, 0 fail на стороне Vercel — гипотеза rate-limit опровергнута.

Vercel support подтвердила: `providerOptions.{google,vertex}.thinkingBudget`.

**Изменения:**
- `src/lib/ai/model-registry.ts` — `extraParams.providerOptions.{google,vertex}.thinkingBudget = 1024` для vercel- и aitunnel-gemini-flash.
- `src/lib/ai/gateway.ts` — `AI_CALL_TIMEOUT_PAID/FREE/GEMINI_MS` 12-30s → 50s.

### Round 3 — AITUNNEL kill + UX fixes (2026-04-20, commits `f257276` + `c6516f5`)

После Round 2 тест-джоб показал, что AITUNNEL всё ещё используется как fallback (баланс на нём 0) → срочный отрыв:

- **`f257276`** — закомментирован `aitunnel-gemini-flash` в model-registry.
- Параллельно: `vercel env rm AITUNNEL_API_KEY production` + redeploy `ai-gjx217fcw`.

UX-баг — «Просканировано 200 страниц» всегда (фейковый file-size estimate, clamp 200):

- **`c6516f5`** — убран file-size estimate, flavor-фразы условные (`hasRealPages ? "Просканировано N страниц" : "Сканируем страницы документа"`). Реальный pageCount из `data.statistics.pageCount` подставляется до завершения анимации.

## Результаты

### Latency после Round 2

| Job | Страниц | Параграфов | Markup | Total | Unknown |
|---|---|---|---|---|---|
| `qcLLsdnFd644qrdZUSmqJ` | 7 | 127 | 1.1s | 3.8s | 0% |
| `XN5l1r6wTiwZrW21ODgOH` | 14 | 531 | 3.1s | 9s | 0% |
| `Db_-um5NkxKzyl3KbvG0F` (учебник 2000 стр) | 125 | 8847 | 53s | 115s | 0% |

**Latency упала ~12x** vs baseline (14-страничные доки: 100-130s → 9s).

### Известные баги (из тестирования)

1. **Hyphenation** — переносы по слогам (`пере-\nнос`) не схлопываются обратно при перетоке текста. Фикс: post-pass убирает `<w:softHyphen/>`, эвристика `(\p{L}+)-\s*\n\s*(\p{Ll}\p{L}*)` → `$1$2`.
2. **OMML формулы** — `<m:oMath>`/`<m:oMathPara>` классифицируются как unknown/heading → post-pass-enforcer ставит `pageBreakBefore` после каждой → 200 стр оригинала превращаются в 2000. Фикс: добавить детект в rule-based-block-classifier → `blockType: "equation"` → пропускать heading-стили и pageBreakBefore.
3. **Frontend 504 на длинных обработках** — UX-поллинг таймаутит до завершения бэка (115s обработка учебника). Не критично для целевого сегмента (5-50 стр), но фронт-таймаут поднять.
4. **Нецелевой контент** — учебники/лекции на 2000 стр. Подумать про soft-detection и баннер «форматтер не для технических работ с большим объёмом формул, рекомендуем LaTeX/Overleaf».

## Что ещё НЕ сделано

### Pending verification

- **2026-04-21**: Vercel CSV Inference Requests — `Reasoning` p50 должен упасть ≤1024.
- **2026-04-26**: SQL по CSAT за 2026-04-19 → 2026-04-26 — сравнение с baseline (1★ share 62%, CSAT 2.2). Критерии:
  - 1★ share ≤40% (таргет) / ≤50% (минимум)
  - CSAT avg ≥3.0 (таргет) / ≥2.7 (минимум)
  - Avg violations на новых 1★ <100
- **2026-04-27**: SQL по CSAT за 2026-04-20 → 2026-04-27 (Round 2 window).

### Roadmap (отложено)

- **Bug fixes (см. выше)**: hyphenation collapse, OMML detection, frontend timeout.
- **Non-target soft-detection**: предупреждение для технических работ с большим количеством формул.
- **Multi-provider AI gateway** (Azure + Anthropic fallback) — `project_ai_provider_expansion.md`. Пока не нужно: Vercel + Google = достаточно после фикса thinkingBudget.
- **Метрика fallback в `jobs.statistics`** + баннер юзеру при partial markup — отложено в плане `~/.claude/plans/3-synchronous-badger.md` (шаги 3-5). Запускать только если CSAT не дотянул к 2026-04-26.

### Rollback trigger

Если к 2026-04-22 доля 1★ >65% → `git revert 330935d 87218f1`.

## Связанные файлы

- `docs/csat-root-cause-2026-04.md` section 7 — deploy event Round 1.
- `docs/seo-content-audit.md` — контент-аудит (несвязанная работа).
- `~/.claude/plans/3-synchronous-badger.md` — план Round 2.
- Memory: `project_csat_fix_deploy_2026_04_19.md`, `project_formatter_bugs_2026_04_20.md`, `project_non_target_uploads.md`.
