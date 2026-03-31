/**
 * Интеграционные тесты: POST /api/payment/webhook
 * Проверяет обработку вебхуков от Lava.top: авторизацию, идемпотентность,
 * обновление статусов и активацию доступа.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock } from "../../mocks/supabase";
import { makePayment, makeWebhookPayload, makeUserAccess } from "../../mocks/factories";

// Моки зависимостей — объявляются до импорта route
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/payment/access", () => ({
  activateAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/bot/provision", () => ({
  canGrantBotAccess: vi.fn().mockResolvedValue(false),
  provisionBotUser: vi.fn().mockResolvedValue(null),
  getUserProfile: vi.fn().mockResolvedValue(null),
  storeBotAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email/transport", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage/file-storage", () => ({
  unlockFullVersion: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/storage/job-store", () => ({
  getJob: vi.fn().mockResolvedValue(null),
  updateJob: vi.fn().mockResolvedValue(undefined),
}));

// after() выполняем коллбек синхронно в тестах
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((cb: () => void) => cb()),
  };
});

// Импорты после vi.mock
import { POST } from "@/app/api/payment/webhook/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { activateAccess } from "@/lib/payment/access";

// Помощник: создать NextRequest с Basic Auth
function makeWebhookRequest(payload: object, authHeader?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (authHeader !== undefined) {
    headers["authorization"] = authHeader;
  }
  return new NextRequest(
    new Request("http://localhost/api/payment/webhook", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
  );
}

function validAuthHeader(): string {
  const token = Buffer.from("webhook_user:webhook_pass").toString("base64");
  return `Basic ${token}`;
}

describe("POST /api/payment/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("отсутствие заголовка Authorization → 401", async () => {
    const req = makeWebhookRequest(makeWebhookPayload());
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("неверные учётные данные Basic Auth → 401", async () => {
    const wrongToken = Buffer.from("hacker:wrong").toString("base64");
    const req = makeWebhookRequest(makeWebhookPayload(), `Basic ${wrongToken}`);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("payment.success — invoice не найден в БД → 200 ok, activateAccess не вызван", async () => {
    const supabase = createSupabaseMock({
      payments: { data: null, error: null },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const req = makeWebhookRequest(
      makeWebhookPayload({ contractId: "unknown-invoice" }),
      validAuthHeader()
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(activateAccess).not.toHaveBeenCalled();
  });

  it("payment.success — платёж уже completed → activateAccess не вызывается (идемпотентность)", async () => {
    const payment = makePayment({ status: "completed", unlock_job_id: null });
    const supabase = createSupabaseMock({
      payments: { data: payment, error: null },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const req = makeWebhookRequest(
      makeWebhookPayload({ contractId: payment.lava_invoice_id }),
      validAuthHeader()
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(activateAccess).not.toHaveBeenCalled();
  });

  it("payment.success — новый платёж → статус обновляется и activateAccess вызывается", async () => {
    const payment = makePayment({ status: "pending", offer_type: "one_time" });
    const supabase = createSupabaseMock({
      payments: { data: payment, error: null },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const req = makeWebhookRequest(
      makeWebhookPayload({ contractId: payment.lava_invoice_id }),
      validAuthHeader()
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(activateAccess).toHaveBeenCalledWith(
      payment.user_id,
      payment.offer_type,
      expect.anything()
    );
  });

  it("payment.success subscription_plus — lava_subscription_id сохраняется в user_access", async () => {
    const payment = makePayment({
      status: "pending",
      offer_type: "subscription_plus",
    });
    const supabase = createSupabaseMock({
      payments: { data: payment, error: null },
      user_access: { data: makeUserAccess({ lava_subscription_id: null }), error: null },
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ error: null }) }),
    });
    supabase.from = vi.fn((table: string) => {
      if (table === "payments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: payment, error: null }) }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "user_access") {
        return {
          update: updateMock,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { bot_deep_link: null }, error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
    }) as never;
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const req = makeWebhookRequest(
      makeWebhookPayload({
        contractId: payment.lava_invoice_id,
        subscriptionId: "sub-abc-123",
        type: "payment.success",
      }),
      validAuthHeader()
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(activateAccess).toHaveBeenCalledWith(
      payment.user_id,
      "subscription_plus",
      "sub-abc-123"
    );
    // user_access обновляется с lava_subscription_id
    expect(updateMock).toHaveBeenCalledWith({ lava_subscription_id: "sub-abc-123" });
  });

  it("subscription.recurring.payment.success → доступ продлевается (дата и uses обновляются)", async () => {
    const access = makeUserAccess({ lava_subscription_id: "sub-recurring-99" });
    const supabase = createSupabaseMock({
      user_access: { data: access, error: null },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const req = makeWebhookRequest(
      {
        type: "subscription.recurring.payment.success",
        subscriptionId: "sub-recurring-99",
      },
      validAuthHeader()
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    // activateAccess не должен вызываться при продлении (управляется напрямую)
    expect(activateAccess).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("subscription.cancelled → 200 ok, доступ не изменяется", async () => {
    const supabase = createSupabaseMock();
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const req = makeWebhookRequest(
      {
        type: "subscription.cancelled",
        subscriptionId: "sub-to-cancel-77",
      },
      validAuthHeader()
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(activateAccess).not.toHaveBeenCalled();
  });
});
