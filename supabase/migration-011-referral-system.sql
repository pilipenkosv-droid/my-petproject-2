-- Migration 011: Referral System
-- Реферальные ссылки, события воронки, награды

-- 1. referral_links: 1 постоянный код на пользователя
CREATE TABLE IF NOT EXISTS referral_links (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_links_code ON referral_links(code);

ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on referral_links"
  ON referral_links FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own referral link"
  ON referral_links FOR SELECT
  USING (auth.uid() = user_id);

-- 2. referral_events: воронка click → registration → first_job
CREATE TABLE IF NOT EXISTS referral_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  code          TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('click', 'registration', 'first_job')),
  session_id    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_referee ON referral_events(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_code ON referral_events(code);
CREATE INDEX IF NOT EXISTS idx_referral_events_type ON referral_events(event_type);

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on referral_events"
  ON referral_events FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own referral events as referrer"
  ON referral_events FOR SELECT
  USING (auth.uid() = referrer_id);

-- 3. referral_rewards: идемпотентность через UNIQUE(user_id, threshold)
CREATE TABLE IF NOT EXISTS referral_rewards (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  threshold     INTEGER NOT NULL,
  reward_months INTEGER NOT NULL,
  granted_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, threshold)
);

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on referral_rewards"
  ON referral_rewards FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own referral rewards"
  ON referral_rewards FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Расширение user_profiles для связи с реферером
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
