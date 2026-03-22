-- Migration 009: User journey tracking
-- Серверный трекинг пути пользователя от первого визита до покупки

-- 1. user_profiles: атрибуция привязанная к зарегистрированному пользователю
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_session_id    TEXT,
  first_landing_page  TEXT,
  first_referrer      TEXT,
  first_utm_source    TEXT,
  first_utm_medium    TEXT,
  first_utm_campaign  TEXT,
  yandex_client_id    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on user_profiles"
  ON user_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT USING (auth.uid() = user_id);

-- 2. page_views: лог посещений страниц
CREATE TABLE IF NOT EXISTS page_views (
  id                BIGSERIAL PRIMARY KEY,
  session_id        TEXT NOT NULL,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  path              TEXT NOT NULL,
  referrer          TEXT,
  yandex_client_id  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_page_views_session_id ON page_views(session_id);
CREATE INDEX idx_page_views_user_id ON page_views(user_id);
CREATE INDEX idx_page_views_created_at ON page_views(created_at);
CREATE INDEX idx_page_views_path ON page_views(path);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on page_views"
  ON page_views FOR ALL USING (true) WITH CHECK (true);

-- 3. session_attributions: first-touch данные (1 строка на сессию)
CREATE TABLE IF NOT EXISTS session_attributions (
  session_id        TEXT PRIMARY KEY,
  landing_page      TEXT NOT NULL,
  referrer          TEXT,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  yandex_client_id  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE session_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on session_attributions"
  ON session_attributions FOR ALL USING (true) WITH CHECK (true);

-- 4. Триггер: автосоздание user_profiles при регистрации
CREATE OR REPLACE FUNCTION create_user_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile_on_signup();

-- 5. Индекс на jobs.session_id (поле существует, но без индекса)
CREATE INDEX IF NOT EXISTS idx_jobs_session_id ON jobs(session_id);
