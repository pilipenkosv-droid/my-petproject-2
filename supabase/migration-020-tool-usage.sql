-- Миграция 020: tool_outputs (хранилище полных результатов AI-инструментов)
-- + поля учёта Pro-квоты на инструменты в user_access
-- + RPC decrement_tool_uses

-- 1. Таблица tool_outputs (TTL 7 дней)
CREATE TABLE IF NOT EXISTS tool_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool TEXT NOT NULL CHECK (tool IN ('rewrite', 'summarize', 'outline', 'ask-guidelines')),
  full_output TEXT NOT NULL,
  -- access_token: 64-символьный hex, выдаётся в email-ссылке. Без него страница /tool-output/[id] не отдаёт контент.
  access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT,
  email_sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_tool_outputs_expires ON tool_outputs(expires_at);

-- RLS: таблица доступна только service_role (используется в API через getSupabaseAdmin).
-- Без политик anon/authenticated ключи блокируются — защита от прямого чтения access_token и full_output.
ALTER TABLE tool_outputs ENABLE ROW LEVEL SECURITY;

-- 2. Колонки квоты в user_access
ALTER TABLE user_access
  ADD COLUMN IF NOT EXISTS tool_uses_remaining INT NOT NULL DEFAULT 0;

ALTER TABLE user_access
  ADD COLUMN IF NOT EXISTS tool_uses_reset_at TIMESTAMPTZ;

-- 3. Атомарный декремент tool_uses_remaining
-- Возвращает оставшееся значение (>=0), -1 если списать нечего
CREATE OR REPLACE FUNCTION decrement_tool_uses(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_remaining INTEGER;
BEGIN
  UPDATE user_access
  SET tool_uses_remaining = tool_uses_remaining - 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND tool_uses_remaining > 0
  RETURNING tool_uses_remaining INTO new_remaining;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN new_remaining;
END;
$$;
