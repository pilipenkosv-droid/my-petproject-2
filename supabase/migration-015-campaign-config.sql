-- Конфигурация сезонных кампаний
CREATE TABLE IF NOT EXISTS campaign_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Дипломный марафон апрель-июнь 2026
INSERT INTO campaign_config (key, value) VALUES
  ('marathon_2026', '{
    "active": true,
    "starts_at": "2026-04-01T00:00:00Z",
    "ends_at": "2026-06-01T00:00:00Z",
    "referral_bonus_uses": 5,
    "group_discount_percent": 30,
    "group_discount_min_members": 5
  }')
ON CONFLICT (key) DO NOTHING;
