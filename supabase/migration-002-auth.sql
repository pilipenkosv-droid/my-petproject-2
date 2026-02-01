-- Migration 002: Auth support
-- Добавляет индекс на user_id и FK к auth.users

-- Индекс для запросов по user_id (профиль — список документов пользователя)
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

-- FK к auth.users (ON DELETE SET NULL — при удалении пользователя jobs остаются)
ALTER TABLE jobs
  ADD CONSTRAINT fk_jobs_user_id
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- RLS (defense-in-depth, service_role обходит автоматически)
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Пользователи видят только свои задачи
CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role имеет полный доступ (для API routes с service_role key)
CREATE POLICY "Service role full access"
  ON jobs FOR ALL
  USING (true)
  WITH CHECK (true);
