-- Аналитические поля для привязки анонимных сессий к пользователям
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS yandex_client_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS referrer TEXT;

-- Таблица серверного логирования скачиваний
CREATE TABLE IF NOT EXISTS download_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id UUID,
  file_type TEXT CHECK (file_type IN ('original', 'formatted')),
  yandex_client_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE download_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on download_events"
  ON download_events FOR ALL
  USING (auth.role() = 'service_role');
