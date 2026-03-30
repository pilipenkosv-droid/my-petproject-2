-- Групповые ссылки для механики "Поделись с одногруппниками"
CREATE TABLE IF NOT EXISTS group_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS group_links_creator_idx ON group_links(creator_id);

-- Участники группы: один пользователь — одна группа (по коду)
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code TEXT NOT NULL REFERENCES group_links(code) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bonus_granted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(group_code, user_id)
);

CREATE INDEX IF NOT EXISTS group_members_code_idx ON group_members(group_code);
