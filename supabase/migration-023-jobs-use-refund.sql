-- Возврат списанного использования при провале обработки.
-- use_consumed_at — момент, когда за задачу списали использование (consumeUse).
-- use_refunded_at — момент возврата; служит ключом идемпотентности (возврат ровно один раз).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS use_consumed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS use_refunded_at TIMESTAMPTZ;

-- Атомарный инкремент remaining_uses (зеркало decrement_remaining_uses).
-- Возвращает остаток после инкремента, или -1 если записи user_access нет.
-- Используется только для компенсации, когда отметка use_consumed_at не проставилась
-- и обычный refund_job_use() уже не сможет опознать списание.
CREATE OR REPLACE FUNCTION public.increment_remaining_uses(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_remaining INTEGER;
BEGIN
  UPDATE user_access
  SET remaining_uses = remaining_uses + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING remaining_uses INTO new_remaining;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN new_remaining;
END;
$$;

-- Возврат использования за задачу одним заявлением.
-- Заявка на возврат (jobs.use_refunded_at) и инкремент remaining_uses выполняются
-- в одной транзакции: раздельные шаги могли оставить задачу «возвращённой» без
-- фактического возврата, если второй запрос падал.
-- Возвращает true, только если возврат действительно произошёл (идемпотентно:
-- повторный вызов для той же задачи вернёт false).
CREATE OR REPLACE FUNCTION public.refund_job_use(p_job_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id TEXT;
BEGIN
  UPDATE jobs
  SET use_refunded_at = NOW()
  WHERE id = p_job_id
    AND use_consumed_at IS NOT NULL
    AND use_refunded_at IS NULL
  RETURNING id INTO claimed_id;

  IF claimed_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE user_access
  SET remaining_uses = remaining_uses + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;

-- Доступ: только service_role (серверные роуты через SERVICE_ROLE_KEY).
-- По умолчанию PostgreSQL выдаёт EXECUTE роли PUBLIC, а PostgREST публикует схему
-- public для anon/authenticated — без REVOKE любой посетитель мог бы вызвать
-- SECURITY DEFINER-функцию и начислить себе использования.
REVOKE EXECUTE ON FUNCTION public.increment_remaining_uses(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_remaining_uses(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_job_use(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_job_use(TEXT, UUID) TO service_role;

-- decrement_remaining_uses создана в migration-011-atomic-decrement.sql без REVOKE,
-- то есть тоже висит доступной для anon/authenticated. Закрываем здесь, а не правкой
-- старой миграции: применённые миграции не переигрываются.
REVOKE EXECUTE ON FUNCTION public.decrement_remaining_uses(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_remaining_uses(UUID) TO service_role;
