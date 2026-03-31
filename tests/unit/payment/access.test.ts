/**
 * Юнит-тесты для getUserAccess() и consumeUse() из src/lib/payment/access.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "../../mocks/supabase";
import { makeUserAccess, pastDate, futureDate } from "../../mocks/factories";

// Мокируем модуль до импорта тестируемого кода
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { getUserAccess, consumeUse } from "@/lib/payment/access";
import { LAVA_CONFIG } from "@/lib/payment/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const mockGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);

describe("getUserAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("новый пользователь (нет записи в БД) → возвращает trial с freeTrialUses", async () => {
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: null, error: { code: "PGRST116", message: "not found" } },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("user-new");

    expect(result.hasAccess).toBe(true);
    expect(result.accessType).toBe("trial");
    expect(result.remainingUses).toBe(LAVA_CONFIG.freeTrialUses);
    expect(result.botDeepLink).toBeNull();
  });

  it("активная подписка → hasAccess true, корректное количество remaining uses", async () => {
    const accessRecord = makeUserAccess({
      access_type: "subscription",
      remaining_uses: 7,
      subscription_active_until: futureDate(15),
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("user-sub");

    expect(result.hasAccess).toBe(true);
    expect(result.accessType).toBe("subscription");
    expect(result.remainingUses).toBe(7);
  });

  it("истёкшая подписка → hasAccess false, accessType 'none'", async () => {
    const accessRecord = makeUserAccess({
      access_type: "subscription",
      remaining_uses: 5,
      subscription_active_until: pastDate(5),
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("user-expired");

    expect(result.hasAccess).toBe(false);
    expect(result.accessType).toBe("none");
  });

  it("подписка с 0 remaining_uses → hasAccess false", async () => {
    const accessRecord = makeUserAccess({
      access_type: "subscription",
      remaining_uses: 0,
      subscription_active_until: futureDate(10),
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("user-no-uses");

    expect(result.hasAccess).toBe(false);
  });

  it("subscription_plus → botDeepLink возвращается из БД", async () => {
    const accessRecord = makeUserAccess({
      access_type: "subscription_plus",
      remaining_uses: 8,
      subscription_active_until: futureDate(20),
      bot_deep_link: "https://t.me/DiploxBot?start=abc123",
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("user-plus");

    expect(result.accessType).toBe("subscription_plus");
    expect(result.botDeepLink).toBe("https://t.me/DiploxBot?start=abc123");
    expect(result.hasAccess).toBe(true);
  });

  it("subscription_plus_trial → botDeepLink возвращается (аналогично plus)", async () => {
    const accessRecord = makeUserAccess({
      access_type: "subscription_plus_trial",
      remaining_uses: 10,
      subscription_active_until: futureDate(7),
      bot_deep_link: "https://t.me/DiploxBot?start=trial456",
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("user-trial-plus");

    expect(result.accessType).toBe("subscription_plus_trial");
    expect(result.botDeepLink).toBe("https://t.me/DiploxBot?start=trial456");
    expect(result.hasAccess).toBe(true);
  });

  it("one_time с remaining_uses > 0 → hasAccess true", async () => {
    const accessRecord = makeUserAccess({
      access_type: "one_time",
      remaining_uses: 3,
      subscription_active_until: null,
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("user-onetime");

    expect(result.hasAccess).toBe(true);
    expect(result.accessType).toBe("one_time");
    expect(result.remainingUses).toBe(3);
  });

  it("one_time с 0 remaining_uses → hasAccess false, accessType 'none'", async () => {
    const accessRecord = makeUserAccess({
      access_type: "one_time",
      remaining_uses: 0,
      subscription_active_until: null,
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("user-onetime-empty");

    expect(result.hasAccess).toBe(false);
    expect(result.accessType).toBe("none");
  });

  it("email администратора → возвращается admin доступ", async () => {
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: null, error: { code: "PGRST116", message: "not found" } },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "pilipenkosv@gmail.com" } },
      error: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await getUserAccess("admin-user-id");

    expect(result.hasAccess).toBe(true);
    expect(result.accessType).toBe("admin");
    expect(result.remainingUses).toBe(999999);
  });
});

describe("consumeUse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("триал-пользователь → upsert вызван с remaining_uses = freeTrialUses - 1", async () => {
    // Первый вызов getSupabaseAdmin (getUserAccess внутри consumeUse): возвращает no record → trial
    // Второй вызов (upsert): тот же мок
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });

    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: null, error: { code: "PGRST116", message: "not found" } },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });

    // Переопределяем from() чтобы для user_access возвращать цепочку с нашим upsertSpy
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = vi.fn((table: string) => {
      const chain = originalFrom(table);
      if (table === "user_access") {
        chain.upsert = upsertSpy;
      }
      return chain;
    });

    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await consumeUse("user-trial");

    expect(result).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        remaining_uses: LAVA_CONFIG.freeTrialUses - 1,
        access_type: "one_time",
      }),
      expect.objectContaining({ onConflict: "user_id" })
    );
  });

  it("пользователь с активной подпиской → RPC decrement вызван, возвращает true", async () => {
    const accessRecord = makeUserAccess({
      access_type: "subscription",
      remaining_uses: 5,
      subscription_active_until: futureDate(10),
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    // RPC возвращает новое значение (5 - 1 = 4)
    supabase.rpc = vi.fn().mockResolvedValue({ data: 4, error: null });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await consumeUse("user-sub");

    expect(result).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("decrement_remaining_uses", { p_user_id: "user-sub" });
  });

  it("RPC возвращает -1 → consumeUse возвращает false", async () => {
    const accessRecord = makeUserAccess({
      access_type: "subscription",
      remaining_uses: 1,
      subscription_active_until: futureDate(10),
    });
    const supabase = createSupabaseMock({
      "auth.users": { data: null, error: { code: "PGRST116", message: "not found" } },
      user_access: { data: accessRecord, error: null },
    });
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: "regular@example.com" } },
      error: null,
    });
    // RPC возвращает -1 — нечего списывать
    supabase.rpc = vi.fn().mockResolvedValue({ data: -1, error: null });
    mockGetSupabaseAdmin.mockReturnValue(supabase as ReturnType<typeof getSupabaseAdmin>);

    const result = await consumeUse("user-sub-empty");

    expect(result).toBe(false);
  });
});
