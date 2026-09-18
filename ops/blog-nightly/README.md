# Ночной конвейер блога diplox.online

Реализация ADR-015 (`docs/adr/015-blog-nightly-pipeline.md`). Раз в ночь:
разведка → редактор (1 вызов LLM) → автор (1 вызов) → проверки → публикация
через `POST /api/blog/publish`. Без Telegram, без обложек, только кластер `gost`.

Зависимости: системный Python 3.12+ (Ubuntu 24.04), только стандартная
библиотека. Node на сервере не нужен.

## Файлы

| Файл | Назначение |
|---|---|
| `run.py` | точка входа: `--stage recon\|score\|editor\|writer\|publish\|all`, `--dry-run`, lock-файл, лог в `--log-dir` |
| `db.py` | схема SQLite и идемпотентные миграции |
| `recon.py` | статьи сайта (RSS + sitemap), Google Suggest, конкуренты (раз в неделю), Wordstat (ручной импорт), GSC (опционально) |
| `similarity.py` | TF-IDF + косинус по заголовкам и ключевикам; `embed_hook` — место для эмбеддингов |
| `score.py` | формула `спрос × непокрытость × сезонность`, шорт-лист из 10 тем |
| `editor.py` | 1 вызов LLM → бриф, валидация по `schemas/brief.json` |
| `writer.py` | 1 вызов LLM → статья JSON |
| `checks.py` | проверки: запрещённый продукт, стоп-слова, объём, ключевики, белый список ГОСТов, уникальность slug, похожесть заголовка |
| `publish.py` | `POST /api/blog/publish`; в dry-run только пишет payload в лог |
| `llm.py` | OpenAI-совместимый клиент: ретраи 429/5xx/timeout, учёт токенов и стоимости, жёсткий лимит вызовов |
| `config.toml` | модели, веса скоринга, пороги, регулярки проверок |
| `prompts/` | правила текста (`tone.md`), инструкции редактора и автора, белый список ГОСТов, разрешённые внутренние ссылки |
| `seeds.txt` | seed-фразы кластера `gost` для Suggest |

## Деплой

```bash
# на сервере, из каталога с исходниками
sudo bash install.sh
```

`install.sh` создаёт `/opt/diplox-blog/`, `/var/lib/diplox-blog/`,
`/var/log/diplox-blog/`, шаблон `/etc/diplox-blog.env` (права 600) и крон-запись:

```
0 2 * * * /usr/bin/python3 /opt/diplox-blog/run.py --stage all >> /var/log/diplox-blog/cron.log 2>&1
```

### `/etc/diplox-blog.env`

```
CROMINM_API_KEY=...            # ключ Crominm
CROMINM_BASE_URL=https://api.crominm.com/v1
BLOG_PUBLISH_TOKEN=...         # тот же токен, что в Vercel
SITE_URL=https://diplox.online
# необязательно:
GSC_SERVICE_ACCOUNT_JSON=/root/.config/indexing-api/service-account.json
```

Крон не читает `/etc/diplox-blog.env` сам — либо добавь в крон-строку
`set -a; . /etc/diplox-blog.env; set +a;`, либо положи переменные в
`/opt/diplox-cron.sh`, который уже подгружает окружение.

### Google Search Console (опционально)

RS256-подпись JWT стандартной библиотекой не делается, поэтому модуль GSC
включается сам, когда на сервере есть пакет:

```bash
sudo apt install python3-google-auth
```

Без пакета или без файла сервис-аккаунта разведка пишет в лог «gsc: skipping»
и идёт дальше — остальные источники работают.

## Сухой прогон

```bash
set -a; . /etc/diplox-blog.env; set +a
BLOG_DRY_RUN=1 python3 /opt/diplox-blog/run.py --stage all \
  --db /tmp/blog.db --log-dir /tmp/blog-logs
```

`BLOG_DRY_RUN=1` (или `--dry-run`) никогда не публикует: payload уходит в лог,
статья и бриф — в `--log-dir` как `brief-<run_id>.json` и `article-<run_id>.json`.

## Что смотреть после ночи

```bash
sqlite3 /var/lib/diplox-blog/blog.db \
  "select date, result, published_slug, llm_calls, tokens, cost_usd from runs order by date desc limit 5;"

sqlite3 /var/lib/diplox-blog/blog.db \
  "select json from briefs order by created_at desc limit 1;"

cat /var/log/diplox-blog/$(date +%F).log
```

## Тесты

```bash
python3 -m unittest discover ops/blog-nightly/tests
```

Сеть и LLM в тестах не задействованы.

## Границы

- Генерируется только кластер `gost`. Кластер `second-brain` исключён; продукта
  «Telegram-бот» не существует — упоминание в тексте валит прогон без переписки
  (`banned_product_mention`).
- Не больше `max_llm_calls_per_run` вызовов LLM за ночь (по умолчанию 3:
  редактор, автор, одна переписка).
- Откат публикации — удалить строку в `blog_posts` вручную.
