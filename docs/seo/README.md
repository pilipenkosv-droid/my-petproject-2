# SEO & GEO — состояние, инструменты, метрики

Единая точка входа для всей SEO/GEO-работы в Diplox. Обновлено: **2026-04-17**.

## Оглавление

1. [Состояние на сегодня](#состояние-на-сегодня)
2. [Что было сделано](#что-было-сделано)
3. [Инструменты и скрипты](#инструменты-и-скрипты)
4. [Метрики и таргеты](#метрики-и-таргеты)
5. [Workflow — как работать дальше](#workflow)
6. [Связанные документы](#связанные-документы)
7. [Заблокированные задачи](#заблокированные-задачи)

---

## Состояние на сегодня

**Baseline (GSC, 28 дней до 2026-04-16):**
| Метрика | Значение |
|---|---:|
| Показы | 1 491 |
| Клики | 13 |
| CTR | 0.87% |
| Avg position | 7.8 |
| Проиндексировано URL | 28 / 91 (31%) |
| Коммерческие клики | 0 |

**Недельный baseline (2026-04-09 → 2026-04-16):** 6 кликов, 1825 показов, 15% index rate (sample 20). См. [docs/seo-weekly/2026-04-16.md](../seo-weekly/2026-04-16.md).

**Главный инсайт:** гипотеза "Google и Yandex ищут разное" подтверждена на данных. Ни один из 23 топ-Wordstat seeds (суммарно ~700K показов/мес в Яндексе) не генерит показов в Google GSC. Полный разбор в [docs/seo-audit-2026-04-17.md](../seo-audit-2026-04-17.md).

---

## Что было сделано

### P0 — базовые фиксы (2026-04-17)

1. **Индексация** — 64 непроиндексированных URL отправлены в Google Indexing API (`scripts/index-urls.ts`)
2. **CTR-фикс** — переписан title/description поста `gost-r-7-0-11-2011-trebovaniya-k-dissertaciyam` (74% всех показов сайта с CTR 0.09%)
3. **Tool pages metadata** — 5 страниц переоптимизированы под Google-long-tail ("бесплатно", "пример", "2026")

### P1 — E-E-A-T и контент (2026-04-17)

4. **Article schema** — Person author (Сергей Пилипенко), publisher.logo, ImageObject dimensions, inLanguage, sameAs
5. **UI** — "Опубликовано / Обновлено" в шапке блог-постов, author-bio block перед CTA
6. **Hub-перелинковка** — все 7 лендингов (diplom/kursovaya/referat/esse/vkr/magisterskaya/otchet-po-praktike) показывают 6 релевантных блог-постов через `getPostsForWorkType()`
7. **3 Google-gap поста (первая волна)** — рейтинг нейросетей, оформление курсовой, повышение уникальности
8. **Google Keyword Harvest** — 477 уникальных suggestions через `scripts/google-suggest.ts`

### Wait-phase — параллельная работа пока Google индексирует (2026-04-17)

9. **llms.txt + robots.txt** — 21 AI-бот разрешён, полная карта сайта для ChatGPT/Perplexity/Claude/Gemini
10. **Content audit + 65 dateModified** — все посты получили `dateModified`, 6 top-impact постов переписаны
11. **4 новых Google-gap поста (вторая волна)** — титульный лист, шаблон скачать, список литературы, ChatGPT промпты
12. **Yandex keyword extension** — +138 ключевиков в 59 постах автоматически через `scripts/yandex-keyword-apply.ts`
13. **Content audit batch-2** — +10 постов переписаны (avg score 52.6 → 55.6)
14. **Habr PR-черновик** — готовая статья 2800+ слов для публикации на VC/Habr/DTF
15. **Weekly monitor** — `scripts/seo-weekly-report.ts` с diff неделя-к-неделе
16. **7 обложек** — nanabanana-generated, привязаны и задеплоены

### Инфраструктура

- Service account `indexing-api@gen-lang-client-0137531495` — Owner в GSC
- Google ADC credentials — в `~/.config/gcloud/application_default_credentials.json` (**истёк — см. [auth-restore.md](../auth-restore.md)**)
- Yandex Webmaster — верифицирован 2026-04-13 (HTML-файл + meta-тег)
- Yandex Metrika ID: `106717062`
- Google Analytics ID: `G-TFYSCZZ8R5`

---

## Инструменты и скрипты

Все скрипты в `scripts/` запускаются через `npx tsx`.

### Мониторинг

| Скрипт | Что делает | Частота |
|---|---|---|
| `scripts/seo-weekly-report.ts` | Еженедельный отчёт GSC + index rate + diff vs прошлая неделя | Воскресенье 10:00 |
| `scripts/gsc-fetch.ts [days]` | Полный GSC snapshot (queries, pages, devices, countries) → `docs/gsc-data.json` | По запросу |
| `scripts/gsc-inspect.ts` | Проверяет индексацию всех URL из sitemap → `docs/gsc-inspect.json` | Каждые 2 недели |

**Cron (опционально):**
```cron
0 10 * * 0  cd /Users/sergejpilipenko/DIplox && npx tsx scripts/seo-weekly-report.ts
```

### Индексация

| Команда | Что делает |
|---|---|
| `npx tsx scripts/index-urls.ts --sitemap` | Отправить все URL sitemap в Google Indexing API (лимит 200/день) |
| `npx tsx scripts/index-urls.ts URL_UPDATED <url>...` | Отправить конкретные URL |
| `npx tsx scripts/index-urls.ts --status <url>` | Проверить когда Google последний раз уведомлён |

### Keyword research

| Скрипт | Источник | Частота |
|---|---|---|
| `scripts/wordstat-collect.ts` | Yandex Wordstat API (нужен `YANDEX_DIRECT_TOKEN`) | Еженедельно |
| `scripts/google-suggest.ts` | Google autocomplete (cp1251 → utf-8) | По запросу |

### Контент-аудит и автоправки

| Скрипт | Что делает |
|---|---|
| `scripts/seo-content-audit.ts` | Скор блог-постов по Google-friendly паттернам → `docs/seo-content-audit.md` |
| `scripts/seo-add-datemodified.ts` | Batch-добавление `dateModified` ко всем постам без него |
| `scripts/yandex-keyword-extend.ts` | Предложения дополнительных keywords по Wordstat-совпадению |
| `scripts/yandex-keyword-apply.ts` | Применяет предложения (только высокочастотные Wordstat phrases) |

---

## Метрики и таргеты

### Baseline → 3 месяца

| Метрика | Baseline (2026-04-17) | Target (2026-07-17) |
|---|---:|---:|
| GSC clicks / 28d | 13 | 500+ |
| GSC impressions / 28d | 1 491 | 30 000+ |
| Avg position | 7.8 | ≤ 10 |
| URL в индексе | 28 / 91 (31%) | 85+ / 100+ (85%+) |
| Commercial clicks | 0 | 100+ |
| Топ-20 по коммерческим запросам | 0 | 10+ |
| Backlinks (VC/Habr/DTF) | 0 | 2-3 |

### Что мерить еженедельно

Запускается автоматически через `seo-weekly-report.ts`:
- Δ clicks / impressions / CTR / avg position
- Δ index rate
- Топ-20 запросов и страниц (подписка)
- Новые запросы vs исчезнувшие

---

## Workflow

### Каждую неделю (15 минут)

1. Запустить `npx tsx scripts/seo-weekly-report.ts` — сохранится в `docs/seo-weekly/`
2. Посмотреть diff-секцию:
   - Если clicks упали > 20% — check GSC напрямую, искать crawl errors
   - Если index rate упал — проверить robots.txt, middleware, canonical
3. По топ-10 запросам смотреть, какие посты получают impressions без кликов — кандидаты на переписывание title/description

### После публикации нового контента

1. `npx tsx scripts/seo-content-audit.ts` — убедиться, что score нового поста ≥ 70
2. `npx tsx scripts/index-urls.ts URL_UPDATED <новый_url>` — уведомить Google
3. Проверить в [Яндекс.Вебмастер](https://webmaster.yandex.ru/site/https:diplox.online:443/dashboard/) через 2-3 дня, появилось ли

### Каждые 2 недели

1. `npx tsx scripts/gsc-inspect.ts` — полная инспекция 100+ URL
2. Сравнить с прошлым snapshot — какие страницы вышли из индекса
3. Запустить `scripts/seo-content-audit.ts` — обновить avg score

### При запуске новой фичи / лендинга

Согласно [`.claude/rules/seo-indexing.md`](../../.claude/rules/seo-indexing.md):

1. Добавить URL в `src/app/sitemap.ts` → нужный массив
2. Проверить canonical через `generatePageMetadata()`
3. Убедиться в robots.txt нет Disallow
4. Задеплоить и запросить индексацию

---

## Связанные документы

### Аналитика и данные
- [seo-audit-2026-04-17.md](../seo-audit-2026-04-17.md) — **полный SEO-аудит** с подтверждением гипотезы Google vs Yandex
- [seo-content-audit.md](../seo-content-audit.md) — скоринг всех постов
- [yandex-keyword-suggestions.md](../yandex-keyword-suggestions.md) — предложения по расширению семантики
- [google-suggest.md](../google-suggest.md) — 477 Google autocomplete фраз по 36 seeds
- [seo-keyword-research-full.md](../seo-keyword-research-full.md) — исходная семантика по Wordstat (Yandex-first)

### Сырые данные (JSON)
- [gsc-data.json](../gsc-data.json) — снапшот GSC 28 дней
- [gsc-inspect.json](../gsc-inspect.json) — индексация всех sitemap URL
- [google-suggest.json](../google-suggest.json) — 477 suggestions
- [wordstat-raw-data.json](../wordstat-raw-data.json) — Wordstat seeds
- [seo-weekly/](../seo-weekly/) — еженедельные snapshot-ы

### Публикации
- [pr/habr-antiplagiat-ai-2026.md](../pr/habr-antiplagiat-ai-2026.md) — готовый PR-черновик для VC/Habr/DTF

### Инструкции
- [auth-restore.md](../auth-restore.md) — восстановление GA4 ADC + Yandex Webmaster OAuth
- [blog-illustrations-guide.md](../blog-illustrations-guide.md) — стайл nanabanana промптов для обложек
- [`.claude/rules/seo-indexing.md`](../../.claude/rules/seo-indexing.md) — правила SEO при добавлении новых страниц

---

## Заблокированные задачи

Требуют интерактивного действия пользователя. См. [auth-restore.md](../auth-restore.md).

1. **GA4 Data API** — ADC refresh token истёк. После восстановления будет работать:
   - Воронка: Google-трафик → сессии → конверсии (signup, payment)
   - Сравнение Google vs Yandex по landing pages и bounce rate
2. **Yandex Webmaster API** — `YANDEX_DIRECT_TOKEN` без scope `webmaster:*`. После восстановления:
   - Честное сравнение top-запросов Google vs Yandex
   - Мониторинг позиций в Яндексе

Команды для восстановления — в [auth-restore.md](../auth-restore.md).

---

## Следующие волны (после индексации)

Эти пункты ждут реакции Google (1-2 недели с 2026-04-17):

- **Content audit batch-3** — остальные 45 постов со score <60
- **3-5 дополнительных Google-gap постов** — темы из `google-suggest.md` (приложения к диплому, введение к курсовой, отчёт по практике, методические указания)
- **Публикация Habr-статьи** → backlink + попадание в "ТОП нейросетей" рейтинги
- **Author page** — `/about` с ссылкой на внешние профили (LinkedIn, Habr, VC)
- **Review schema на tool pages** — если удастся собрать 10-50 реальных отзывов
- **Core Web Vitals audit** — через PageSpeed Insights, оптимизация LCP/INP

---

## История коммитов (wait-phase sprint 2026-04-17)

```
a294f7a blog(covers): attach 7 cover images
f490e68 seo(google): content audit batch-2 — 10 more posts
e66a19d seo(monitor): weekly report script with diff
30f6207 seo(yandex): +138 keywords across 59 posts + Habr/VC PR draft
539048e seo(google): wait-phase — llms.txt + robots + content audit + 65 dateModified
7ff15b5 seo(google): 4 new Google-gap posts
129a071 seo(google): P1 — hub linking + 3 Google-gap posts + keyword suggest harvester
875d2b8 seo(google): P1 E-E-A-T — Article schema Person author + dateModified UI + bio block
a6fefe6 seo(google): remove duplicate "| Diplox" from tool-page titles
6ab4f68 seo(google): P0 fixes — retune tool-page metadata + gost-7-0-11 post + audit
```
