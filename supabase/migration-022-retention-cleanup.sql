-- Миграция 022: индексы и хелпер-функция для retention-очистки
-- Нужно для поддержки Free-tier Supabase: регулярная очистка устаревших строк
-- позволяет не выходить за лимиты строк и диска без апгрейда.

-- 1. Вспомогательная функция для мониторинга размера таблиц
CREATE OR REPLACE FUNCTION public.table_sizes()
RETURNS TABLE(table_name text, total_bytes bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    relname::text,
    pg_total_relation_size(relid)
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC;
$$;

-- Доступ: service_role (для cron/API) и authenticated (для дашборда)
GRANT EXECUTE ON FUNCTION public.table_sizes() TO service_role;
GRANT EXECUTE ON FUNCTION public.table_sizes() TO authenticated;

-- 1b. Список старых объектов Storage в обход незакрытой схемы storage.
-- cleanupOldFiles() вызывает эту RPC (PostgREST не видит схему storage напрямую
-- → "Invalid schema: storage" → очистка молча падала, бакеты разрастались).
CREATE OR REPLACE FUNCTION public.list_old_storage_objects(p_bucket text, p_cutoff timestamptz)
RETURNS TABLE(name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = storage, public
AS $$
  SELECT name FROM storage.objects
  WHERE bucket_id = p_bucket AND created_at < p_cutoff;
$$;

GRANT EXECUTE ON FUNCTION public.list_old_storage_objects(text, timestamptz) TO service_role;

-- 2. Индексы на колонках, по которым идёт retention-удаление
-- idx_page_views_created_at уже существует (migration-001 или ранее)

CREATE INDEX IF NOT EXISTS idx_download_events_created_at
  ON download_events(created_at);

-- email_sent_log использует sent_at (не created_at)
CREATE INDEX IF NOT EXISTS idx_email_sent_log_sent_at
  ON email_sent_log(sent_at);

CREATE INDEX IF NOT EXISTS idx_blog_distribution_log_created_at
  ON blog_distribution_log(created_at);
