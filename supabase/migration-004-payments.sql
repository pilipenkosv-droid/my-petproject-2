-- Migration 004: Payment system (Lava.top integration)

-- Платежи (каждый invoice от Lava.top)
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lava_invoice_id TEXT,
  offer_type TEXT NOT NULL CHECK (offer_type IN ('one_time', 'subscription')),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_lava_invoice_id ON payments(lava_invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Подписки и разовые покупки пользователей
CREATE TABLE IF NOT EXISTS user_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_type TEXT NOT NULL CHECK (access_type IN ('one_time', 'subscription')),
  -- Для разовой: кол-во оставшихся обработок
  remaining_uses INTEGER DEFAULT 0,
  -- Для подписки: период действия
  subscription_active_until TIMESTAMPTZ,
  lava_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_access_user_id ON user_access(user_id);

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_access ENABLE ROW LEVEL SECURITY;

-- Пользователи видят только свои данные
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own access"
  ON user_access FOR SELECT USING (auth.uid() = user_id);

-- Service role полный доступ
CREATE POLICY "Service role full access on payments"
  ON payments FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on user_access"
  ON user_access FOR ALL USING (true) WITH CHECK (true);
