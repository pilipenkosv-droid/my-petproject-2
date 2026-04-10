-- Добавляем model_id для корреляции CSAT с конкретной моделью
-- Хранит основную модель, использованную для block markup (самый критичный шаг)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS model_id TEXT;

-- Индекс для аналитики по моделям
CREATE INDEX IF NOT EXISTS idx_jobs_model_id ON jobs (model_id) WHERE model_id IS NOT NULL;
