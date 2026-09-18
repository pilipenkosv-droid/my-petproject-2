# diplox-worker

Внешний воркер обработки документов (ADR-016, фаза 1). Забирает задачи `jobs`
в статусе `pending` через RPC `claim_next_job`, гоняет тот же пайплайн, что и
`/api/process-gost`, и пишет статусы обратно. Живёт вне Vercel, поэтому лимит
60 секунд на функцию его не касается.

Два процесса: `main.mjs` — супервизор (очередь, heartbeat, таймауты),
`child.mjs` — обработка одной задачи. Разделение нужно потому, что пайплайн
дёргает pandoc и soffice через `execSync` и блокирует event loop.

## Сборка

```bash
npm run worker:build        # → ops/worker/dist/{main,child}.mjs
```

esbuild собирает всё в бандл (внешних зависимостей нет), git-sha вшивается в
код и уезжает в `statistics.worker.gitSha`.

## Локальный прогон

```bash
WORKER_ID=mac-dev node --env-file=.env.local ops/worker/dist/main.mjs --once --verbose
```

`--once` — обработать одну задачу (или выйти, если очередь пуста), `--verbose` —
печатать heartbeat и ping.

## Переменные окружения

| Переменная | Зачем |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | адрес Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | доступ к очереди и хранилищу (RPC открыты только service_role) |
| `AI_GATEWAY_API_KEY` | пайплайн может дёрнуть шлюз |
| `WORKER_ID` | идентификатор в таблице `workers` (по умолчанию hostname) |
| `NODE_ENV` | `production` на сервере |

## Коды выхода дочернего процесса

| Код | Значение | Что делает супервизор |
|---|---|---|
| 0 | задача завершена | ничего |
| 2 | терминальная ошибка (ребёнок уже проставил `failed` и вернул списание) | ничего |
| 3 | временная ошибка (сеть, 5xx шлюза, таймаут pandoc/soffice) | `attempts < 2` → `release_job`, иначе `failJob` + возврат списания |

Убитый по таймауту (15 мин) или по остановке ребёнок считается временной ошибкой.

## Файлы рядом с бандлом

Пайплайн резолвит опорные документы от `process.cwd()`, поэтому в tar должны
попасть по тем же относительным путям:

- `scripts/pipeline-v6/spike-pandoc/reference-gost.docx`
- `templates/`

Юнит обязан запускаться с `WorkingDirectory` = каталог установки.
