-- Лог отправленных lifecycle-писем для дедупликации
CREATE TABLE IF NOT EXISTS email_sent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_id TEXT,
  metadata JSONB
);

-- Дедупликация: один тип письма на юзера (для писем без привязки к job)
CREATE UNIQUE INDEX IF NOT EXISTS email_sent_log_dedup
  ON email_sent_log(user_id, email_type)
  WHERE job_id IS NULL;

-- Дедупликация: один тип письма на юзера на job
CREATE UNIQUE INDEX IF NOT EXISTS email_sent_log_job_dedup
  ON email_sent_log(user_id, email_type, job_id)
  WHERE job_id IS NOT NULL;

-- Механизм отписки от lifecycle-писем
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_unsubscribed_types TEXT[] DEFAULT '{}';
