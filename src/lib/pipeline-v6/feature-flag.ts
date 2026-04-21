// Feature flag for pipeline-v6 rollout.
//
// Rollout tiers:
//   1. env USE_PIPELINE_V6=1 — server-wide on (staging / local)
//   2. query param ?v6=1 — per-request opt-in (beta testers)
//   3. cookie dlx_v6=1 — sticky opt-in after first visit
//   4. user allowlist — env PIPELINE_V6_ALLOWED_USERS=uuid1,uuid2
//
// Any of the four enables v6. Otherwise legacy formatter runs.

export interface FlagContext {
  userId?: string;
  query?: URLSearchParams;
  cookies?: { get(name: string): { value: string } | undefined };
}

const envFlag = () => process.env.USE_PIPELINE_V6 === "1";

function inAllowlist(userId: string | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.PIPELINE_V6_ALLOWED_USERS ?? "";
  if (!raw.trim()) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .includes(userId);
}

export function shouldUsePipelineV6(ctx: FlagContext): {
  enabled: boolean;
  reason: "env" | "query" | "cookie" | "allowlist" | "off";
} {
  if (envFlag()) return { enabled: true, reason: "env" };
  if (ctx.query?.get("v6") === "1") return { enabled: true, reason: "query" };
  if (ctx.cookies?.get("dlx_v6")?.value === "1") return { enabled: true, reason: "cookie" };
  if (inAllowlist(ctx.userId)) return { enabled: true, reason: "allowlist" };
  return { enabled: false, reason: "off" };
}
