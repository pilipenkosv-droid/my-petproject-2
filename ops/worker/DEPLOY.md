# Деплой воркера на VDS

Ops-часть ADR-016 (`docs/adr/016-vds-worker.md`). Сервер: Timeweb `194.87.43.23`,
Ubuntu 24.04, 2 vCPU, 3,9 ГБ RAM, без свопа. Там же живут `pandoc-svc` и ночной
конвейер блога (ADR-015).

Файлы: `install.sh` (на сервере, от root), `deploy.sh` (на Mac),
`diplox-worker.service`, `diplox-worker.env.example`.

## Что ставится через apt и зачем

| Пакет | Зачем |
|---|---|
| `nodejs` 22.x (NodeSource `setup_22.x`) | рантайм бандла. В apt Ubuntu 24.04 — Node 18; Node 20 EOL с 30.04.2026 |
| `libreoffice-writer` (`--no-install-recommends`) | `soffice` рендерит docx в PDF, откуда `toc-pagenum.ts` берёт номера страниц для содержания |
| `poppler-utils` | `pdftotext` — чтение того PDF |
| `fonts-liberation` | Liberation Serif метрически совместим с Times New Roman: без него soffice подменяет шрифт и разбивка на страницы уезжает |

`pandoc` 3.1.3 на сервере уже есть — не трогаем (прод v6 сейчас ходит в
`pandoc-svc` той же версии, регрессии нет).

`install.sh` ставит Node только если `node` отсутствует или мажор < 22; остальное
идемпотентно (`apt-get install -y`, `cp`, `systemctl enable`, крон — с проверкой).

## `/etc/diplox-worker.env`

Права `0600 root:root`. Создаётся из `diplox-worker.env.example` только если файла нет.

| Переменная | Значение |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | из `~/diplox/.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | из `~/diplox/.env.local` |
| `AI_GATEWAY_API_KEY` | из `~/diplox/.env.local` |
| `WORKER_ID` | `vds-1` |
| `NODE_ENV` | `production` |

`PANDOC_SERVICE_URL` **не задавать**: пустое значение переключает сборку docx на
локальный `spawn("pandoc")` вместо сетевого хопа. `PIPELINE_V7_PERCENT` не задаём —
в коде дефолт 100.

## Первый запуск

1. Владелец подтверждает список apt-пакетов и содержимое env (см. выше).
2. На Mac: `bash ops/worker/deploy.sh --no-restart` — соберёт бандл, зальёт tar,
   прогонит `install.sh`. Служба будет `enabled`, но **не запущена**.
3. На сервере: вписать значения в `/etc/diplox-worker.env`, проверить `chmod 600`.
4. `systemctl start diplox-worker`
5. `journalctl -u diplox-worker -f` — ждём строку о готовности и `worker_ping`
   без ошибок резолва модулей.
6. `curl -s -H "Authorization: Bearer $CRON_SECRET" https://diplox.online/api/health/worker | jq`
   → `status: "ok"`, возраст heartbeat секунды. Та же проверка идёт кроном
   каждые 15 минут через `/opt/diplox-cron.sh /api/health/worker auth`.

Дальше деплой — `bash ops/worker/deploy.sh` (с рестартом). Флаги: `--start`
(запустить службу прямо из `install.sh`), `--no-restart`, `--dry-run` (только
печатает команды). Хост и ключ переопределяются через `WORKER_HOST` и
`WORKER_SSH_KEY`.

## Откат

1. `PROCESSING_MODE=inline` в переменных Vercel — задачи снова считаются в роуте,
   деплой не нужен. Это стоп-кран, он первый.
2. `systemctl stop diplox-worker` на сервере. По `SIGTERM` воркер доделывает
   текущий документ (до `TimeoutStopSec=300`), недоделанная задача возвращается
   в `pending`.
3. Откат версии бандла — повторный `deploy.sh` с прошлого коммита.

## Запасной путь доставки

`git pull && npm ci --omit=dev` на сервере **не поддерживается**: клона репозитория
там нет, а `npm ci` на 2 vCPU без свопа — минуты и риск OOM рядом с pandoc-svc.
Единственный путь — tar из `deploy.sh`. Бандл самодостаточен: `dist/main.mjs` и
`dist/child.mjs` собраны esbuild-ом со всеми зависимостями внутрь, рядом едут
только данные, которые пайплайн ищет по относительным путям от `cwd`
(`scripts/pipeline-v6/spike-pandoc/reference-gost.docx` и `templates/`).
Поэтому юнит задаёт `WorkingDirectory=/opt/diplox-worker`.

Если Mac недоступен, tar можно собрать на любой машине с клоном репозитория и
Node 22 и положить на сервер руками:

```bash
npm run worker:build
tar -czf /tmp/w.tar.gz ops/worker/dist scripts/pipeline-v6/spike-pandoc/reference-gost.docx \
  templates ops/worker/install.sh ops/worker/diplox-worker.service ops/worker/diplox-worker.env.example
# на сервере
mkdir -p /tmp/u && tar -xzf /tmp/w.tar.gz -C /tmp/u && mv /tmp/u/ops/worker/dist /tmp/u/dist
bash /tmp/u/ops/worker/install.sh /tmp/u
```

## Уборка /tmp

`install.sh` добавляет крон-строку `find /tmp -maxdepth 1 \( -name 'pandoc-v6-*' -o
-name 'v6-*' \) -mmin +120 -exec rm -rf {} +`. С `PrivateTmp=true` временные
каталоги пайплайна лежат в приватном `/tmp` юнита и исчезают вместе с процессом,
так что строка подметает только хост-овый `/tmp` — она нужна, если `PrivateTmp`
когда-нибудь выключат. Оставлена, как просит ADR-016.
