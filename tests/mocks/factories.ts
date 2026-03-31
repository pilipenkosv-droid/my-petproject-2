/**
 * Фабрики тестовых данных для Diplox.
 * Каждая фабрика возвращает дефолтный объект с возможностью override.
 */

/** Запись user_access из Supabase */
export function makeUserAccess(overrides: Record<string, unknown> = {}) {
  return {
    id: "ua-test-id",
    user_id: "user-test-id",
    access_type: "subscription",
    remaining_uses: 10,
    subscription_active_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    lava_subscription_id: null,
    bot_access_granted: false,
    bot_deep_link: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Запись payments из Supabase */
export function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-test-id",
    user_id: "user-test-id",
    lava_invoice_id: "inv-test-123",
    offer_type: "one_time",
    amount: 159,
    currency: "RUB",
    status: "pending",
    payment_url: "https://pay.lava.top/test",
    unlock_job_id: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

/** Payload Lava.top webhook */
export function makeWebhookPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "payment.success",
    contractId: "inv-test-123",
    subscriptionId: null,
    amount: "159.00",
    currency: "RUB",
    email: "test@example.com",
    ...overrides,
  };
}

/** Дата в прошлом */
export function pastDate(daysAgo: number = 1): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

/** Дата в будущем */
export function futureDate(daysAhead: number = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}
