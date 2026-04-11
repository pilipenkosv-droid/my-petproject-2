-- Добавляем тип события 'payment' в referral_events
-- Реферальный бонус теперь начисляется при оплате друга, а не при регистрации

ALTER TABLE referral_events
  DROP CONSTRAINT IF EXISTS referral_events_event_type_check;

ALTER TABLE referral_events
  ADD CONSTRAINT referral_events_event_type_check
  CHECK (event_type IN ('click', 'registration', 'first_job', 'payment'));
