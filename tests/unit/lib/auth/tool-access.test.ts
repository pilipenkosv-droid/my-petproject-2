import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGetUserAccess = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/payment/access", () => ({
  getUserAccess: (id: string) => mockGetUserAccess(id),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockSelect(),
        }),
      }),
      update: (patch: unknown) => {
        mockUpdate(patch);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  }),
}));

import { getToolAccess, consumeToolUse } from "@/lib/auth/tool-access";
import { TOOL_USES_PER_MONTH } from "@/lib/payment/config";

beforeEach(() => {
  mockGetUserAccess.mockReset();
  mockUpdate.mockReset();
  mockSelect.mockReset();
  mockRpc.mockReset();
});

describe("getToolAccess", () => {
  it("anon: returns truncate=true when userId is null", async () => {
    const r = await getToolAccess(null);
    expect(r.tier).toBe("anon");
    expect(r.shouldTruncate).toBe(true);
    expect(r.canUseFullResult).toBe(false);
    expect(r.toolUsesRemaining).toBe(0);
  });

  it("admin: returns full access, infinity remaining", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "admin" });
    const r = await getToolAccess("u-admin");
    expect(r.tier).toBe("admin");
    expect(r.shouldTruncate).toBe(false);
    expect(r.canUseFullResult).toBe(true);
    expect(r.toolUsesRemaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("free: trial users get truncated output", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "trial" });
    const r = await getToolAccess("u-trial");
    expect(r.tier).toBe("free");
    expect(r.shouldTruncate).toBe(true);
    expect(r.canUseFullResult).toBe(false);
  });

  it("free: one_time users get truncated output", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "one_time" });
    const r = await getToolAccess("u-one");
    expect(r.tier).toBe("free");
    expect(r.shouldTruncate).toBe(true);
  });

  it("pro: subscription returns existing remaining when reset_at in future", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "subscription" });
    const future = new Date(Date.now() + 10 * 86400_000).toISOString();
    mockSelect.mockResolvedValue({
      data: { tool_uses_remaining: 17, tool_uses_reset_at: future },
      error: null,
    });

    const r = await getToolAccess("u-pro");
    expect(r.tier).toBe("pro");
    expect(r.shouldTruncate).toBe(false);
    expect(r.toolUsesRemaining).toBe(17);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("pro: lazy-resets quota when tool_uses_reset_at is in the past", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "subscription_plus" });
    const past = new Date(Date.now() - 86400_000).toISOString();
    mockSelect.mockResolvedValue({
      data: { tool_uses_remaining: 0, tool_uses_reset_at: past },
      error: null,
    });

    const r = await getToolAccess("u-pro2");
    expect(r.toolUsesRemaining).toBe(TOOL_USES_PER_MONTH);
    expect(mockUpdate).toHaveBeenCalledOnce();
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.tool_uses_remaining).toBe(TOOL_USES_PER_MONTH);
    expect(patch.tool_uses_reset_at).toBeTruthy();
  });

  it("pro: lazy-resets when tool_uses_reset_at is null", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "subscription" });
    mockSelect.mockResolvedValue({
      data: { tool_uses_remaining: 0, tool_uses_reset_at: null },
      error: null,
    });

    const r = await getToolAccess("u-pro3");
    expect(r.toolUsesRemaining).toBe(TOOL_USES_PER_MONTH);
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it("pro: returns 0 remaining if user_access row missing", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "subscription" });
    mockSelect.mockResolvedValue({ data: null, error: { message: "not found" } });

    const r = await getToolAccess("u-pro4");
    expect(r.toolUsesRemaining).toBe(0);
  });
});

describe("consumeToolUse", () => {
  it("admin: no DB call, returns true", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "admin" });
    const ok = await consumeToolUse("u-admin", "rewrite");
    expect(ok).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("pro: returns true when RPC returns >=0", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "subscription" });
    mockRpc.mockResolvedValue({ data: 12, error: null });
    const ok = await consumeToolUse("u-pro", "summarize");
    expect(ok).toBe(true);
  });

  it("pro: returns false when RPC returns -1 (quota exceeded)", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "subscription" });
    mockRpc.mockResolvedValue({ data: -1, error: null });
    const ok = await consumeToolUse("u-pro", "outline");
    expect(ok).toBe(false);
  });

  it("returns false on RPC error", async () => {
    mockGetUserAccess.mockResolvedValue({ accessType: "subscription" });
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const ok = await consumeToolUse("u-pro", "ask-guidelines");
    expect(ok).toBe(false);
  });
});
