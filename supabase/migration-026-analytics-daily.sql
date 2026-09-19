-- Вечный архив дневной аналитики.
--
-- jobs живут 30 дней (cleanup.ts), download_events 90, page_views 30
-- (retention.ts), поэтому динамику воронки старше месяца восстановить нельзя.
-- Раз в сутки /api/cron/analytics-snapshot считает агрегат за прошедшие
-- UTC-сутки и кладёт его сюда (дубль — в приватный репо diplox-analytics).
-- Персональных данных в data нет: только счётчики. См. ADR-018.
CREATE TABLE IF NOT EXISTS analytics_daily (
  day        DATE PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Без политик: доступ только у service_role.
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
