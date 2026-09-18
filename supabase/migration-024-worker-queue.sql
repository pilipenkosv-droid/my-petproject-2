-- Очередь задач для внешнего воркера (ADR-016, фаза 1).
--
-- Роут кладёт задачу в статусе pending, воркер на VDS её забирает. Захват должен
-- быть атомарным, а FOR UPDATE SKIP LOCKED через PostgREST недоступен — поэтому
-- захват, heartbeat и возврат задачи живут в RPC-функциях.

-- worker_id — кто держит задачу (NULL = свободна).
-- worker_claimed_at / worker_heartbeat_at — для сборщика зависших: по heartbeat
--   видно, жив ли процесс, который взял задачу.
-- attempts — счётчик попыток; временная ошибка возвращает задачу в очередь,
--   но не бесконечно.
-- shadow_of — id «настоящей» задачи, копией которой является эта. Теневые задачи
--   считает воркер ради сравнения, пользователю они не видны и не списывают
--   использований; отчёты фильтруют их по shadow_of IS NULL.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_claimed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_heartbeat_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shadow_of TEXT;

-- Воркер опрашивает очередь каждые 3 секунды. Частичный индекс держит выборку
-- «самая старая свободная задача» на десятке строк вместо всей таблицы jobs.
CREATE INDEX IF NOT EXISTS jobs_pending_queue_idx
  ON jobs (created_at)
  WHERE status = 'pending' AND worker_id IS NULL;

-- Простаивающий воркер не имеет задачи, в которую писать heartbeat, поэтому
-- «жив ли сервер» определяется отдельной таблицей: супервизор пингует её всегда.
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL,
  hostname TEXT,
  git_sha TEXT,
  started_at TIMESTAMPTZ
);

-- Захват одной задачи. SKIP LOCKED закрывает гонку между несколькими воркерами
-- по построению: каждый получает свою строку или ничего.
CREATE OR REPLACE FUNCTION public.claim_next_job(p_worker_id TEXT)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET worker_id = p_worker_id,
      status = 'analyzing',
      worker_claimed_at = NOW(),
      worker_heartbeat_at = NOW(),
      updated_at = NOW(),
      attempts = attempts + 1
  WHERE id = (
    SELECT id FROM jobs
    WHERE status = 'pending' AND worker_id IS NULL
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$;

-- Отметка «задача ещё считается». Условие на worker_id не даёт чужому процессу
-- продлевать жизнь задаче, которую он уже не держит.
CREATE OR REPLACE FUNCTION public.heartbeat_job(p_job_id TEXT, p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  touched TEXT;
BEGIN
  UPDATE jobs
  SET worker_heartbeat_at = NOW(),
      updated_at = NOW()
  WHERE id = p_job_id
    AND worker_id = p_worker_id
  RETURNING id INTO touched;

  RETURN touched IS NOT NULL;
END;
$$;

-- Возврат задачи в очередь: остановка воркера или временная ошибка.
-- Завершённую или проваленную задачу не воскрешаем.
CREATE OR REPLACE FUNCTION public.release_job(p_job_id TEXT, p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  touched TEXT;
BEGIN
  UPDATE jobs
  SET status = 'pending',
      worker_id = NULL,
      worker_claimed_at = NULL,
      updated_at = NOW()
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND status NOT IN ('completed', 'failed')
  RETURNING id INTO touched;

  RETURN touched IS NOT NULL;
END;
$$;

-- Признак жизни воркера. started_at ставится только при первой вставке —
-- по нему видно, перезапускался ли процесс.
CREATE OR REPLACE FUNCTION public.worker_ping(p_worker_id TEXT, p_hostname TEXT, p_git_sha TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO workers (id, last_seen_at, hostname, git_sha, started_at)
  VALUES (p_worker_id, NOW(), p_hostname, p_git_sha, NOW())
  ON CONFLICT (id) DO UPDATE
  SET last_seen_at = NOW(),
      hostname = EXCLUDED.hostname,
      git_sha = EXCLUDED.git_sha;
END;
$$;

-- Доступ: только service_role. По умолчанию PostgreSQL выдаёт EXECUTE роли PUBLIC,
-- а PostgREST публикует схему public для anon/authenticated — без REVOKE любой
-- посетитель мог бы захватывать и возвращать чужие задачи.
REVOKE EXECUTE ON FUNCTION public.claim_next_job(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_job(TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.heartbeat_job(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_job(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_job(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_job(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.worker_ping(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_ping(TEXT, TEXT, TEXT) TO service_role;

-- Таблица workers читается только через SECURITY DEFINER-функции и service_role;
-- RLS без политик закрывает её от anon/authenticated в PostgREST.
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
