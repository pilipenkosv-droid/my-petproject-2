/**
 * Глобальный setup для Vitest — stub env vars, mock next/server
 */
import { vi, afterEach } from "vitest";

// Stub environment variables
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
vi.stubEnv("LAVA_API_KEY", "test-lava-key");
vi.stubEnv("LAVA_WEBHOOK_LOGIN", "webhook_user");
vi.stubEnv("LAVA_WEBHOOK_PASSWORD", "webhook_pass");
vi.stubEnv("BOT_API_URL", "https://bot.test.com");
vi.stubEnv("BOT_ADMIN_API_KEY", "test-bot-admin-key");
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://diplox.online");
vi.stubEnv("RESEND_API_KEY", "test-resend-key");
vi.stubEnv("EMAIL_FROM", "test@diplox.online");

// Очистка моков после каждого теста
afterEach(() => {
  vi.restoreAllMocks();
});
