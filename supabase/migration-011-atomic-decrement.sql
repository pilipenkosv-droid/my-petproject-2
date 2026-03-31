-- Атомарный декремент remaining_uses с проверкой > 0
-- Возвращает количество оставшихся использований после декремента, или -1 если нечего списывать
CREATE OR REPLACE FUNCTION decrement_remaining_uses(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_remaining INTEGER;
BEGIN
  UPDATE user_access
  SET remaining_uses = remaining_uses - 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND remaining_uses > 0
  RETURNING remaining_uses INTO new_remaining;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN new_remaining;
END;
$$;
