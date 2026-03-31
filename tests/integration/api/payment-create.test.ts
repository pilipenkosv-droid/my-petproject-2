/**
 * Интеграционные тесты: POST /api/payment/create
 * Проверяет создание invoice в Lava.top: авторизацию, валидацию,
 * дедупликацию и обработку ошибок.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock } from "../../mocks/supabase";
import { makePayment } from "../../mocks/factories";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/payment/lava-client", () => ({
  createInvoice: vi.fn(),
}));

import { POST } from "@/app/api/payment/create/route";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { createInvoice } from "@/lib/payment/lava-client";

// Помощник: создать аутентифицированный NextRequest
function makeCreateRequest(body: object) {
  return new NextRequest(
    new Request("http://localhost/api/payment/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/payment/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("неаутентифицированный запрос → 401", async () => {
    // createSupabaseServer.auth.getUser возвращает null user
    const anonClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    };
    vi.mocked(createSupabaseServer).mockResolvedValue(anonClient as never);

    const req = makeCreateRequest({ offerType: "one_time" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/авторизоваться/i);
  });

  it("недопустимый offerType → 400", async () => {
    const authClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "u@test.com" } },
          error: null,
        }),
      },
    };
    vi.mocked(createSupabaseServer).mockResolvedValue(authClient as never);

    // getSupabaseAdmin нужен для дедуп-запроса — вернём пустой mock
    const admin = createSupabaseMock({ payments: { data: null, error: null } });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const req = makeCreateRequest({ offerType: "invalid_type" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/тариф/i);
  });

  it("существующий pending-платёж (до 30 мин) → возвращает существующий URL без вызова createInvoice", async () => {
    const authClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "u@test.com" } },
          error: null,
        }),
      },
    };
    vi.mocked(createSupabaseServer).mockResolvedValue(authClient as never);

    const existingPayment = makePayment({
      status: "pending",
      payment_url: "https://pay.lava.top/existing",
      lava_invoice_id: "inv-existing-456",
    });

    const admin = createSupabaseMock({
      payments: { data: existingPayment, error: null },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const req = makeCreateRequest({ offerType: "one_time" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentUrl).toBe("https://pay.lava.top/existing");
    expect(body.invoiceId).toBe("inv-existing-456");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("нет pending-платежа → createInvoice вызывается, платёж сохраняется, URL возвращается", async () => {
    const authClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-2", email: "new@test.com" } },
          error: null,
        }),
      },
    };
    vi.mocked(createSupabaseServer).mockResolvedValue(authClient as never);

    // maybeSingle вернёт null — нет pending-платежей
    const admin = createSupabaseMock({ payments: { data: null, error: null } });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    vi.mocked(createInvoice).mockResolvedValue({
      id: "inv-new-789",
      paymentUrl: "https://pay.lava.top/new",
    } as never);

    const req = makeCreateRequest({ offerType: "subscription" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentUrl).toBe("https://pay.lava.top/new");
    expect(body.invoiceId).toBe("inv-new-789");
    expect(createInvoice).toHaveBeenCalledOnce();
  });

  it("createInvoice бросает ошибку → 500", async () => {
    const authClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-3", email: "err@test.com" } },
          error: null,
        }),
      },
    };
    vi.mocked(createSupabaseServer).mockResolvedValue(authClient as never);

    const admin = createSupabaseMock({ payments: { data: null, error: null } });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    vi.mocked(createInvoice).mockRejectedValue(new Error("Lava.top недоступен"));

    const req = makeCreateRequest({ offerType: "one_time" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Lava\.top недоступен/);
  });
});
