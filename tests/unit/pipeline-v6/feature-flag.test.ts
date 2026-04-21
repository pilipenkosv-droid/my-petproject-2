import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shouldUsePipelineV6 } from "../../../src/lib/pipeline-v6/feature-flag";

const origEnv = process.env.USE_PIPELINE_V6;
const origAllow = process.env.PIPELINE_V6_ALLOWED_USERS;

function cookieJar(map: Record<string, string>) {
  return {
    get(name: string) {
      return map[name] ? { value: map[name] } : undefined;
    },
  };
}

beforeEach(() => {
  delete process.env.USE_PIPELINE_V6;
  delete process.env.PIPELINE_V6_ALLOWED_USERS;
});
afterEach(() => {
  if (origEnv !== undefined) process.env.USE_PIPELINE_V6 = origEnv;
  if (origAllow !== undefined) process.env.PIPELINE_V6_ALLOWED_USERS = origAllow;
});

describe("shouldUsePipelineV6", () => {
  it("off by default", () => {
    expect(shouldUsePipelineV6({}).enabled).toBe(false);
  });

  it("env USE_PIPELINE_V6=1 turns on", () => {
    process.env.USE_PIPELINE_V6 = "1";
    expect(shouldUsePipelineV6({})).toEqual({ enabled: true, reason: "env" });
  });

  it("query ?v6=1 opts in", () => {
    const query = new URLSearchParams("v6=1");
    expect(shouldUsePipelineV6({ query })).toEqual({ enabled: true, reason: "query" });
  });

  it("cookie dlx_v6=1 opts in", () => {
    const cookies = cookieJar({ dlx_v6: "1" });
    expect(shouldUsePipelineV6({ cookies })).toEqual({ enabled: true, reason: "cookie" });
  });

  it("allowlist matches userId", () => {
    process.env.PIPELINE_V6_ALLOWED_USERS = "u1,u2,u3";
    expect(shouldUsePipelineV6({ userId: "u2" })).toEqual({ enabled: true, reason: "allowlist" });
    expect(shouldUsePipelineV6({ userId: "u4" }).enabled).toBe(false);
  });
});
