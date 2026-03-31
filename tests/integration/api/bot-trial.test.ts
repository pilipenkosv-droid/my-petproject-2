/**
 * Интеграционные тесты: POST /api/bot/trial
 * Проверяет активацию бесплатного 7-дневного trial Diplox Bot:
 * авторизацию, идемпотентность и успешный сценарий с deepLink.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock } from "../../mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/payment/access", () => ({
  activateBotTrial: vi.fn(),
}));

vi.mock("@/lib/bot/provision", () => ({
  canGrantBotAccess: vi.fn().mockResolvedValue(false),
  provisionBotUser: vi.fn().mockResolvedValue(null),
  getUserProfile: vi.fn().mockResolvedValue(null),
  storeBotAccess: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/bot/trial/route";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { activateBotTrial } from "@/lib/payment/access";
import {
  canGrantBotAccess,
  provisionBotUser,
  getUserProfile,
  storeBotAccess,
} from "@/lib/bot/provision";

// Вспомогательный POST-запрос без тела (handler не принимает тело)
function makeTrialRequest() {
  return new NextRequest(
    new Request("http://localhost/api/bot/trial", {
      method: "POST",
    })
  );
}

describe("POST /api/bot/trial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("неаутентифицированный запрос → 401", async () => {
    const anonClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    };
    vi.mocked(createSupabaseServer).mockResolvedValue(anonClient as never);

    const res = await POST(makeTrialRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/авторизац/i);
  });

  it("пользователь уже имеет доступ к боту → 409", async () => {
    const authClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-bot-1", email: "bot@test.com" } },
          error: null,
        }),
      },
    };
    vi.mocked(createSupabaseServer).mockResolvedValue(authClient as never);
    vi.mocked(activateBotTrial).mockResolvedValue({
      success: false,
      reason: "already_has_access",
    } as never);

    const res = await POST(makeTrialRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/уже есть доступ/i);
  });

  it("успешная активация → 200, botDeepLink присутствует в ответе", async () => {
    const authClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-bot-2", email: "newbot@test.com" } },
          error: null,
        }),
      },
    };
    vi.mocked(createSupabaseServer).mockResolvedValue(authClient as never);
    vi.mocked(activateBotTrial).mockResolvedValue({ success: true } as never);

    const admin = createSupabaseMock();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    vi.mocked(canGrantBotAccess).mockResolvedValue(true);
    vi.mocked(getUserProfile).mockResolvedValue({
      email: "newbot@test.com",
      name: "Test User",
    } as never);
    vi.mocked(provisionBotUser).mockResolvedValue({
      success: true,
      deepLink: "https://t.me/DiploxBot?start=abc123",
      existing: false,
    } as never);
    vi.mocked(storeBotAccess).mockResolvedValue(undefined);

    const res = await POST(makeTrialRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.botDeepLink).toBe("https://t.me/DiploxBot?start=abc123");
    expect(body.trialDays).toBe(7);
    expect(storeBotAccess).toHaveBeenCalledWith(
      admin,
      "user-bot-2",
      "https://t.me/DiploxBot?start=abc123"
    );
  });
});
