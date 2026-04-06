-- Migration 016: Add exponential backoff columns to rate_limits
-- Вместо блокировки на целую минуту при одной ошибке,
-- используем счётчик ошибок подряд + временную блокировку с backoff.

ALTER TABLE rate_limits
  ADD COLUMN IF NOT EXISTS consecutive_errors integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_until bigint NOT NULL DEFAULT 0;
