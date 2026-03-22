-- Таблица для отслеживания дистрибуции статей блога на внешние площадки
CREATE TABLE IF NOT EXISTS blog_distribution_log (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug           text NOT NULL,
  platform       text NOT NULL CHECK (platform IN ('telegram','vk','vc','habr','rss')),
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','distributed','failed','permanently_failed','skipped','draft_ready')),
  retry_count    integer NOT NULL DEFAULT 0,
  error_message  text,
  distributed_at timestamptz,
  created_at     timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS blog_distribution_log_slug_platform ON blog_distribution_log (slug, platform);
CREATE INDEX IF NOT EXISTS blog_distribution_log_status ON blog_distribution_log (status, retry_count);
