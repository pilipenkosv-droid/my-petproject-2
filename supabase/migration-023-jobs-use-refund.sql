-- Возврат списанного использования при провале обработки.
-- use_consumed_at — момент, когда за задачу списали использование (consumeUse).
-- use_refunded_at — момент возврата; служит ключом идемпотентности (возврат ровно один раз).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS use_consumed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS use_refunded_at TIMESTAMPTZ;

-- Атомарный инкремент remaining_uses (зеркало decrement_remaining_uses).
-- Возвращает остаток после инкремента, или -1 если записи user_access нет.
CREATE OR REPLACE FUNCTION increment_remaining_uses(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
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
