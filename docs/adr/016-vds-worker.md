# ADR-016 — перенос обработки документов на VDS: асинхронный воркер

- Дата: 2026-09-18
- Статус: **accepted** — фаза 1 (`/api/process-gost`) в проде с 18.09.2026 (PR #38), фаза 2 (методичка + статический TOC v7) с 19.09.2026 (PR #39, #40); `PROCESSING_MODE=worker`, `WORKER_PERCENT=50`
- Связанные: [ADR-014 — pipeline-v7](014-pipeline-v7-experiment.md), [ADR-015 — ночной конвейер блога](015-blog-nightly-pipeline.md) (тот же сервер), `supabase/migration-023-jobs-use-refund.sql`

## Контекст

Вопрос владельца: «Если мы перенесём процесс обработки документов (весь) на VDS, то проблема с 60 секундами ограничения на Vercel не будет больше нам мешать?» — да, не будет: лимит `maxDuration = 60` относится к времени ответа HTTP-функции, а не к задаче. Если функция только принимает файл и ставит задачу в очередь, а считает отдельный процесс, потолка времени обработки не остаётся вовсе.

Сегодня всю работу делает сам роут, синхронно внутри запроса: `/api/process-gost` (v7 с откатом в v6), `/api/extract-rules` (разбор методички LLM, дедлайн 50 с), `/api/confirm-rules` (легаси-форматтер, дедлайн 50 с). Следствия, которые видны в коде:

- Прогресс — два `setTimeout` на 1,5 с и 4 с (`process-gost/route.ts`), они рисуют «analyzing → formatting» независимо от того, что происходит.
- Убитая таймаутом функция не успевает записать статус, поэтому появился самолечащий `failIfStuck` (3 минуты) в `GET /api/status/[jobId]` и возврат списания через `refund_job_use`. Это лечение симптома.
- Клиент сдаётся через 5 минут (`useJobStatus`, `timeout = 5 * 60 * 1000`).
- Часть функциональности v6 на проде выключена окружением: `formula-extractor.ts` и `toc-pagenum.ts` дёргают локальные `pandoc`, `soffice`, `pdftotext` через `execSync` и молча деградируют, если их нет; сборка идёт через удалённый `PANDOC_SERVICE_URL`. Формулы теряются, номера страниц в содержании остаются «—».

Трафик ~400 задач в месяц (~15 в день), p95 форматирования v7 — 0,6 с; дорогие случаи — легаси-режим с LLM (30–50 с) и проход LibreOffice (~1 мин). Очередь глубиной 1 достаточна с запасом.

VDS Timeweb `194.87.43.23` (Ubuntu 24.04, 2 vCPU, 3,9 ГБ RAM, 47 ГБ): Python 3.12, pandoc, nginx, `pandoc-svc.service`, 7 кронов через `/opt/diplox-cron.sh`; **Node на нём нет**. Туда же по ADR-015 едет ночной конвейер блога.

## Решение

### Архитектура: роуты ставят задачу, воркер её делает

1. Роут валидирует доступ и файл, кладёт исходник в bucket `documents`, создаёт job в статусе `pending`, отвечает `202 { jobId }` — целевое время ответа <2 с.
2. Воркер на VDS в цикле забирает одну задачу, гоняет пайплайн, пишет реальные стадии, кладёт результаты в `results`, ставит `completed`/`failed`.
3. Фронт по-прежнему опрашивает `GET /api/status/[jobId]` — контракт статуса не меняется, меняется только то, что статусы стали настоящими.

**Атомарный захват.** `FOR UPDATE SKIP LOCKED` через PostgREST недоступен, поэтому миграция 024 добавляет колонки `worker_id TEXT`, `worker_claimed_at`, `worker_heartbeat_at`, `attempts INT DEFAULT 0` и RPC `claim_next_job(p_worker_id TEXT)`: `UPDATE jobs SET worker_id = …, status = 'analyzing', worker_claimed_at = NOW(), worker_heartbeat_at = NOW(), attempts = attempts + 1 WHERE id = (SELECT id FROM jobs WHERE status = 'pending' AND worker_id IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. Внутри RPC блокировка законна — гонки между будущими вторыми воркерами закрыты по построению.

**Параллелизм 1.** 2 vCPU, и один документ уже умеет занять оба ядра (soffice). Очередь глубиной 15 задач в сутки этого не заметит; поднять до 2 — смена одной константы.

**Супервизор + дочерний процесс.** Родитель держит цикл захвата, шлёт heartbeat каждые 10 с, следит за жёстким таймаутом (15 мин) и убивает зависшего ребёнка; ребёнок (`fork`) выполняет один документ и умирает. Причина: `toc-pagenum.ts` и `formula-extractor.ts` используют `execSync` и блокируют event loop — heartbeat из того же процесса во время рендера LibreOffice не отправится. Плюс утечки памяти умирают вместе с ребёнком.

**Повторы.** `attempts < 2` и ошибка временная (сеть, 5xx шлюза, таймаут pandoc) → задача возвращается в `pending`. Провал гейта верности, битый файл, отказ классификатора — терминальны сразу.

**Сборщик зависших.** `failIfStuck` остаётся, но становится осведомлённым о воркере: `worker_id IS NULL` → порог 3 минуты как сейчас; `worker_id IS NOT NULL` → порог от `worker_heartbeat_at`, 10 минут. **Отдельно чинится `pending`:** сегодня он входит в `STUCK_STATUSES`, и в режиме воркера задача, честно ждущая очереди 3 минуты, будет убита с возвратом. Для `pending` в режиме воркера порог 20 минут, сообщение «очередь перегружена», возврат списания как обычно.

**Остановка.** `SIGTERM` → новые задачи не захватываются, текущая доделывается, при превышении `TimeoutStopSec=300` ребёнок убивается, задача возвращается в `pending` (`worker_id = NULL`). Перезапуск при деплое не теряет документ.

### Runtime: Node 20 LTS, собранный бандл

Пайплайны — десятки тысяч строк TypeScript (`pipeline-v7`, `pipeline-v6`, легаси `pipeline`, `src/lib/ai`, `src/lib/storage`). Переписывать их на Python — не вариант. На VDS нужен Node 20 LTS из NodeSource.

**Изоляция от Next.js.** Импорты `next/*` в `src/lib`: `auth/api-auth.ts` (`next/headers`), `auth/trial.ts` (типы), `blog/posts-db.ts` (`unstable_cache`), `seo/metadata.ts` (тип), `supabase/server.ts` (`next/headers`). Пайплайны и хранилище чисты. Блокирующая проблема одна: `job-store.ts`, `file-storage.ts`, `payment/access.ts`, `payment/refund.ts`, `ai/rate-limiter.ts` тянут `getSupabaseAdmin` из `@/lib/supabase/server`, а тот импортирует `next/headers` — под обычным Node в ESM это падает на резолве (проверено). Правка: вынести `getSupabaseAdmin` в `src/lib/supabase/admin.ts` (без импортов Next), `server.ts` реэкспортирует его.

**Сборка на Mac, не на сервере.** `npm ci` на 2 vCPU — минуты и своп. Деплой: esbuild собирает `ops/worker/main.ts` в один `dist/worker.mjs` (все зависимости — чистый JS: jszip, docx, mammoth, pdf-parse, supabase-js, nanoid, zod), к нему `templates/` (нужен `--reference-doc` для v6), tar + `scp` + `systemctl restart diplox-worker`. Запасной путь (`git pull && npm ci --omit=dev`) описан в README, но не основной. `tsx` в рантайме не используем.

**Юнит** `/etc/systemd/system/diplox-worker.service`: `ExecStart=/usr/bin/node --max-old-space-size=1024 /opt/diplox-worker/worker.mjs`, `EnvironmentFile=/etc/diplox-worker.env` (0600, root), `Restart=always`, `RestartSec=5`, `MemoryMax=2G`, `PrivateTmp=true`, `TimeoutStopSec=300`, логи в journald. `MemoryMax=2G`, а не 1,5G: soffice запускается как потомок и попадает в тот же cgroup (~400–500 МБ). Потолок кучи Node — 1 ГБ.

Переменные в `/etc/diplox-worker.env`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, `WORKER_ID`, `PIPELINE_V7_PERCENT`. `PANDOC_SERVICE_URL` **не задаётся** — см. ниже.

### Локальные бинарники: что это чинит

`apt install --no-install-recommends libreoffice-writer poppler-utils` (~400 МБ), pandoc уже есть. Переключение на локальные пути уже написано: `assembleWithPandoc` берёт remote-ветку только при заданном `PANDOC_SERVICE_URL`, иначе `spawn("pandoc", …)`; `formula-extractor.ts` и `toc-pagenum.ts` всегда пробуют локальные бинарники. Код под это писать не нужно.

Что перестаёт быть сломанным на проде: формулы не выпадают молча, номера страниц в содержании считаются вместо «—», статическое заполнение TOC для v7 (ADR-014 отложил его «на воркер, где есть soffice»), исчезает сетевой хоп до pandoc-svc.

### Списания и триал

**Списание остаётся на постановке в очередь.** Проверка доступа обязана случиться до приёма задачи — иначе пользователь без остатка ставит в очередь сколько угодно документов. Механика возврата уже есть и идемпотентна: `consumeUse` → `markUseConsumed` → при провале `refundUse`. Меняется только тот, кто зовёт `refundUse`: воркер на терминальной ошибке и сборщик зависших — на потерянной задаче.

**Триал-cookie ставит роут на ответе `202`**, как сейчас на `200`. Альтернатива (ставить в статусе при `completed`) даёт анонимному окно поставить в очередь десяток документов.

### Фронтенд

`useJobStatus`: `timeout` 5 мин → 10 мин. Сообщения стадий уже приходят из `job.statusMessage`. Ошибка воркера показывается из `job.error`. Больше ничего.

### Раскатка

Флаг `PROCESSING_MODE=inline|worker` читается в каждом из трёх роутов по отдельности — переводить их можно поодиночке, начиная с `/api/process-gost`.

1. **Неделя тени.** `PROCESSING_MODE=inline`, но роут создаёт теневую копию задачи (`shadow = true`), которую забирает воркер. Пользователю отдаётся результат инлайна; из теневых считаем долю успехов, время, расхождение размера результата. Теневые задачи не списывают использований.
2. **10 %** задач в режиме воркера (бакет от `jobId`, как у `PIPELINE_V7_PERCENT`), 3–4 дня.
3. **100 %**, инлайн-код остаётся в репозитории.
4. **Стоп-кран** — `PROCESSING_MODE=inline` в Vercel, без деплоя. Инлайн-ветку не удаляем как минимум месяц.

**Деградация, когда сервер лежит.** На постановке роут смотрит `worker_heartbeat_at`: если старше 2 минут — задача выполняется инлайн, как сегодня.

### Наблюдение

Без новых сервисов. `job.statistics.worker = { workerId, queueWaitMs, processMs, attempts, hostname, gitSha }`. `GET /api/health/worker` (секрет как у `/api/cleanup`): возраст последнего heartbeat, число задач в `pending` и возраст самой старой, число `failed` за 24 ч. В `/opt/diplox-cron.sh` — строка раз в 15 минут, которая дёргает этот endpoint и печатает в stdout при не-`ok`; cron шлёт письмом через `MAILTO`.

## Последствия

Хорошее: потолка времени обработки больше нет; прогресс настоящий; формулы и номера страниц чинятся самим наличием бинарников; ответ роута — сотни миллисекунд.

Принятое плохое: собственный сервер в критическом пути; второй способ доставки кода (tar + systemctl) рядом с `git push` в Vercel — расхождение версий возможно (воркер пишет свой git-sha в `statistics.worker`); отладка в journald на коробке владельца.

## Риски

- **Один VDS, без резерва.** Упал — задачи копятся в `pending`, новые уходят инлайн по heartbeat-правилу. Исходник уже в Storage, списание возвращается сборщиком.
- **Соседи по коробке.** pandoc-svc, ночной блог (02:00 UTC, ≤200 МБ), 7 кронов. Пик воркера — node ≤1 ГБ + soffice ~0,5 ГБ из 3,9 ГБ. Вторую параллельную задачу при этом раскладе включать нельзя.
- **Секреты на коробке.** `SUPABASE_SERVICE_ROLE_KEY` и ключ AI Gateway в файле `0600 root:root`, SSH только по ключу владельца.
- **Egress Supabase.** Десятки мегабайт на документ, единицы гигабайт в месяц — в пределах бесплатного плана, но новая статья.
- **Диск.** `mkdtemp` в `pandoc.ts`/`toc-pagenum.ts` не чистится при SIGKILL: `PrivateTmp=true` плюс строка в кроне `find /tmp -maxdepth 1 -name 'pandoc-v6-*' -mmin +120 -exec rm -rf {} +`.
- **Гонка кода.** Миграции применяются до деплоя обеих сторон, новые поля — только опциональные.

## План

1. Миграция 024: колонки воркера + RPC `claim_next_job`, `heartbeat_job`, `release_job` — 2 ч.
2. `src/lib/supabase/admin.ts` (вынос `getSupabaseAdmin`), реэкспорт в `server.ts` — 1 ч.
3. `ops/worker/`: супервизор, `runner.ts` (v7/v6/легаси по `requirementsMode`), esbuild-сборка — 6 ч.
4. Режим очереди в `/api/process-gost` за флагом — 2 ч; `/api/extract-rules` и `/api/confirm-rules` — ещё 2 ч.
5. Осведомлённый о воркере `failIfStuck` + потолок ожидания `pending` + возврат брошенных задач — 2 ч.
6. `useJobStatus`: таймаут 10 минут, показ `job.error` — 1 ч.
7. `/api/health/worker` + `statistics.worker` — 1,5 ч.
8. `ops/worker/install.sh` (NodeSource 20, `libreoffice-writer`, `poppler-utils`, каталоги, юнит, шаблон env) — 2 ч.
9. Теневой режим — 2 ч.
10. Неделя тени, разбор, 10 % → 100 % — 3 ч работы, календарно ~2 недели.

**Итого ~24 часа** разработки, 3–4 дня до теневого прогона плюс две недели наблюдения.

## Реализовано (18–19.09.2026) — отличия от плана

- **Node 22 LTS**, не 20: Node 20 вышел из поддержки 30.04.2026. Сборка `esbuild` (добавлен в devDependencies) в `ops/worker/dist/{main,child}.mjs`, target `node22`.
- **Таблица `workers`** для признака жизни: простаивающий воркер не имеет задачи, куда писать heartbeat. Супервизор пингует `worker_ping` каждые 10 с; роут и `/api/health/worker` читают `workers.last_seen_at` (порог 2 мин).
- **Маркер `queued_at`** в `jobs`: `createJob` создаёт строку в `pending` до сохранения файла, и без маркера воркер захватывал задачу раньше роута (найдено ревью). `claim_next_job` берёт только `status='pending' AND worker_id IS NULL AND queued_at IS NOT NULL`.
- **Reference-doc v6** лежит в `scripts/pipeline-v6/spike-pandoc/reference-gost.docx` и читается от `process.cwd()`; бандл несёт его по тому же пути, юнит запускается с `WorkingDirectory=/opt/diplox-worker`.
- **Тень** реализована строками `jobs` с `shadow_of` (фильтр `shadow_of IS NULL` в `/api/stats` и `/api/admin/analytics`), но раскатка пошла без неё: владелец включил `PROCESSING_MODE=worker`, `WORKER_PERCENT=50` сразу.
- **`completeJob` не воскрешает `failed`**: сборщик зависших может провалить задачу и вернуть списание, пока осиротевший ребёнок доделывает документ.
- **Сборщик зависших** (`src/lib/storage/job-stuck.ts`): инлайн 3 мин от `updated_at`; под воркером 10 мин от `worker_heartbeat_at`; в очереди (`queued_at` задан) 20 мин с сообщением «Очередь перегружена».
- **Фаза 2A**: `/api/extract-rules` и `/api/confirm-rules` за тем же флагом; задача проходит очередь дважды, `markJobQueued` сбрасывает `worker_id`/`attempts`, после разбора методички воркер снимает признаки захвата. На VDS `MARKUP_BUDGET_MS=300000`, `AI_CALL_TIMEOUT_MS=240000` (таймаут одной попытки шлюза стал настраиваемым). Страница `/confirm-rules/[jobId]` опрашивает статус.
- **Фаза 2B**: `src/lib/pipeline-v7/aux/toc-static.ts` после сохранения и гейта рендерит docx через soffice (`UpdateFields=true`), читает номера страниц `pdftotext` и пишет их в кэш поля TOC; на Vercel (без soffice) шаг пропускается. Заголовки собираются по `w:outlineLvl`, как их видит само поле.
- **Порядок выкладки**: воркер (`ops/worker/deploy.sh`) всегда раньше роутов — старый воркер захватывает задачу методички и обрабатывает её как ГОСТ (воспроизведено 18.09).
- Крон здоровья использует `CRON_SECRET` через `/opt/diplox-cron.sh … auth`; отдельный `WORKER_HEALTH_SECRET` не вводился.
- Прод-замеры 18–19.09: `/api/process-gost` — 202 за 2–2,5 с, обработка v7 ~1 с; методичка 75 тыс. символов — разбор 52 с на VDS (на Vercel был бы таймаут), форматирование 14 с; TOC v7 — 3,4 с на рендер.

**Только владелец:** SSH на `194.87.43.23`; `apt install`; заполнить `/etc/diplox-worker.env`; `systemctl enable --now diplox-worker`; две строки в `/opt/diplox-cron.sh`; флаг `PROCESSING_MODE` и `WORKER_HEALTH_SECRET` в Vercel.

**Запуск — после деплоя текущих веток** (fix rules-extraction, ночной блог, retrieval stage).

## Как проверить

```bash
# 1. Воркер локально на Mac против dev-проекта Supabase
node --env-file=.env.worker.dev ops/worker/dist/worker.mjs --once --verbose

# 2. Синтетический документ на 3 страницы через очередь: ожидаем 202 и jobId быстрее 2 с
curl -s -F sourceDocument=@data/corpus/synthetic/01-merged-cells.docx -F workType=diploma https://diplox.online/api/process-gost
watch -n2 "curl -s https://diplox.online/api/status/<jobId> | jq '.status, .progress, .statusMessage'"

# 3. Документ на 200 страниц (>60 с): pending → analyzing → formatting → completed,
#    statistics.worker.processMs > 60000, номера страниц в содержании не «—»

# 4. Стоп-кран: PROCESSING_MODE=inline в Vercel → следующий документ идёт старым путём
curl -s "https://diplox.online/api/health/worker?secret=$WORKER_HEALTH_SECRET" | jq
journalctl -u diplox-worker -n 100 --no-pager
```

## Допущения

- IP сервера `194.87.43.23` подтверждён владельцем 18.09.2026; `85.239.38.44` в ADR-001 и старых планах — прежний адрес.
- Резолв `next/headers` под обычным Node проверен для ESM-импорта; если сборка окажется CJS, вынос `getSupabaseAdmin` всё равно нужен.
- Оценка egress и часов — арифметика, не замер.
