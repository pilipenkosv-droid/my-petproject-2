-- SmartFormat: Phase 1 — Миграция на Supabase
-- Выполнить в Supabase Dashboard → SQL Editor

-- ============================================
-- 1. Таблица jobs (заменяет /tmp/smartformat/jobs/*.json)
-- ============================================
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  status_message TEXT NOT NULL DEFAULT '',
  source_document_id TEXT,
  requirements_document_id TEXT,
  source_original_name TEXT,
  requirements_original_name TEXT,
  marked_original_id TEXT,
  formatted_document_id TEXT,
  rules JSONB,
  violations JSONB,
  statistics JSONB,
  error TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- ============================================
-- 2. Таблица rate_limits (заменяет /tmp/smartformat/rate-limits/*.json)
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  model_id TEXT PRIMARY KEY,
  minute_requests INTEGER NOT NULL DEFAULT 0,
  minute_start BIGINT NOT NULL DEFAULT 0,
  day_requests INTEGER NOT NULL DEFAULT 0,
  day_start BIGINT NOT NULL DEFAULT 0,
  last_request_at BIGINT NOT NULL DEFAULT 0
);

-- ============================================
-- 3. Автообновление updated_at для jobs
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 4. Storage buckets (создать через Dashboard → Storage)
-- ============================================
-- Bucket: documents (private) — загруженные пользователем файлы
-- Bucket: results (private) — результаты обработки
--
-- Или через SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('results', 'results', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. Storage policies (service_role обходит RLS, но для полноты)
-- ============================================
-- Разрешаем service_role полный доступ (он и так имеет, но явно)
-- Для будущего Phase 2: добавить user-specific policies
