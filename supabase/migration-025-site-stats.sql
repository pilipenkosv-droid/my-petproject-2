-- Накопительный счётчик обработанных документов для лендинга.
--
-- Строки jobs удаляются через 30 дней (cleanup.ts), поэтому COUNT(*) по jobs
-- показывает только последний месяц. Перед удалением cleanup прибавляет число
-- удаляемых completed-задач (без теневых копий) сюда; лендинг показывает
-- archived + текущие completed в jobs.
-- Стартовое значение 3000 — оценка истории до 2026-09-19, точные данные утеряны
-- (до 2026-03-21 TTL jobs был 24 часа).
CREATE TABLE IF NOT EXISTS site_stats (
  key TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_stats (key, value) VALUES ('documents_processed_archived', 3000)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION increment_site_stat(p_key TEXT, p_delta BIGINT)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO site_stats (key, value) VALUES (p_key, p_delta)
  ON CONFLICT (key) DO UPDATE
    SET value = site_stats.value + EXCLUDED.value, updated_at = now()
  RETURNING value;
$$;

REVOKE ALL ON FUNCTION increment_site_stat(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
ALTER TABLE site_stats ENABLE ROW LEVEL SECURITY;
