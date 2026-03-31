/**
 * Юнит-тесты для проверки Basic Auth в POST /api/payment/webhook
 *
 * verifyBasicAuth() — инлайн-функция в route.ts, тестируется через вызов POST-хендлера.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Мокируем все зависимости route.ts до импорта хендлера
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    },
  })),
}));

vi.mock("@/lib/payment/access", () => ({
  activateAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/payment/config", () => ({
  LAVA_CONFIG: {
    offers: {
      subscription: { uses: 10 },
      subscriptionPlus: { uses: 10 },
    },
    freeTrialUses: 1,
  },
}));

vi.mock("@/lib/storage/file-storage", () => ({
  unlockFullVersion: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/storage/job-store", () => ({
  getJob: vi.fn().mockResolvedValue(null),
  updateJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/bot/provision", () => ({
  canGrantBotAccess: vi.fn().mockResolvedValue(false),
  getUserProfile: vi.fn().mockResolvedValue(null),
  provisionBotUser: vi.fn().mockResolvedValue(null),
  storeBotAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email/transport", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email/templates", () => ({
  subscriptionWelcomeEmail: vi.fn().mockReturnValue("<html>welcome</html>"),
  oneTimePurchaseEmail: vi.fn().mockReturnValue("<html>thanks</html>"),
}));

// Мокируем next/server.after() чтобы он не ломал тесты
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((fn: () => void) => {
      // Вызываем immediately в тестах (не ждём ответа)
      void Promise.resolve().then(fn);
    }),
  };
});

import { POST } from "@/app/api/payment/webhook/route";

/** Создаёт NextRequest с указанным Authorization заголовком и валидным JSON телом */
function makeWebhookRequest(authHeader?: string): NextRequest {
  const body = JSON.stringify({ type: "unknown.event" });
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (authHeader !== undefined) {
    headers["authorization"] = authHeader;
  }
  return new NextRequest("http://localhost/api/payment/webhook", {
    method: "POST",
    headers,
    body,
  });
}

/** Кодирует login:password в Base64 для Basic Auth */
function encodeBasicAuth(login: string, password: string): string {
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

describe("POST /api/payment/webhook — проверка Basic Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("корректные учётные данные → хендлер продолжает обработку (не возвращает 401)", async () => {
    // setup.ts устанавливает LAVA_WEBHOOK_LOGIN=webhook_user, LAVA_WEBHOOK_PASSWORD=webhook_pass
    const request = makeWebhookRequest(encodeBasicAuth("webhook_user", "webhook_pass"));
    const response = await POST(request);

    expect(response.status).not.toBe(401);
  });

  it("неверные учётные данные → 401", async () => {
    const request = makeWebhookRequest(encodeBasicAuth("wrong_user", "wrong_pass"));
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("отсутствует заголовок Authorization → 401", async () => {
    const request = makeWebhookRequest(undefined);
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("некорректный формат заголовка (не 'Basic ...') → 401", async () => {
    const request = makeWebhookRequest("Bearer some-token");
    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
