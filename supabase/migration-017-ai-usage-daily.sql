-- Migration 017: AI usage daily snapshots
-- Хранит ежедневные итоги использования AI моделей для аналитики.
-- rate_limits хранит только текущий день (upsert), эта таблица — исторические данные.

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  model_id text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  total_requests integer NOT NULL DEFAULT 0,
  successful_requests integer NOT NULL DEFAULT 0,
  failed_requests integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, date)
);

-- RLS: только service_role
ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_usage_daily"
ON ai_usage_daily FOR ALL
USING (true)
WITH CHECK (true);

-- Индекс для быстрых выборок по дате
CREATE INDEX idx_ai_usage_daily_date ON ai_usage_daily (date DESC);
