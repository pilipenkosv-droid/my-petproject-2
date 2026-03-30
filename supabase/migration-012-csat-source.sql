-- Добавляем поле source в таблицу feedback для аналитики CSAT по каналам
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'result_page';
-- source: 'result_page' | 'after_download' | 'return_visit' | 'email'
