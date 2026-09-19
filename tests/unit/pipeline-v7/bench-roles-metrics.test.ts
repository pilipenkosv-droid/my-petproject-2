import { describe, it, expect } from "vitest";
import { computeMetrics, type GoldLabel } from "../../../scripts/pipeline-v7/bench-roles-metrics";
import type { Role } from "@/lib/pipeline-v7/classify/types";

describe("computeMetrics", () => {
  it("is 100% accurate when predictions match gold exactly", () => {
    const gold: GoldLabel[] = [
      { i: 0, role: "heading_L1" },
      { i: 1, role: "body" },
      { i: 2, role: "body" },
    ];
    const predicted = new Map<number, Role>([
      [0, "heading_L1"],
      [1, "body"],
      [2, "body"],
    ]);
    const m = computeMetrics(gold, predicted);
    expect(m.accuracy).toBe(1);
    expect(m.matched).toBe(3);
    expect(m.correct).toBe(3);
    expect(m.confusion.size).toBe(2); // heading_L1|heading_L1, body|body
  });

  it("computes per-role precision/recall and confusion on mismatches", () => {
    const gold: GoldLabel[] = [
      { i: 0, role: "heading_L1" },
      { i: 1, role: "heading_L2" },
      { i: 2, role: "body" },
    ];
    // heading_L2 mispredicted as heading_L1; body correct.
    const predicted = new Map<number, Role>([
      [0, "heading_L1"],
      [1, "heading_L1"],
      [2, "body"],
    ]);
    const m = computeMetrics(gold, predicted);
    expect(m.accuracy).toBeCloseTo(2 / 3);

    const h1 = m.perRole.find((r) => r.role === "heading_L1")!;
    expect(h1.tp).toBe(1); // i=0 correct
    expect(h1.fp).toBe(1); // i=1 predicted heading_L1 but gold was heading_L2
    expect(h1.fn).toBe(0);
    expect(h1.precision).toBeCloseTo(0.5);
    expect(h1.recall).toBe(1);

    const h2 = m.perRole.find((r) => r.role === "heading_L2")!;
    expect(h2.tp).toBe(0);
    expect(h2.fp).toBe(0);
    expect(h2.fn).toBe(1);
    expect(h2.precision).toBeNull();
    expect(h2.recall).toBe(0);

    expect(m.confusion.get("heading_L2|heading_L1")).toBe(1);
  });

  it("skips gold rows without a matching prediction", () => {
    const gold: GoldLabel[] = [
      { i: 0, role: "body" },
      { i: 1, role: "body" },
    ];
    const predicted = new Map<number, Role>([[0, "body"]]);
    const m = computeMetrics(gold, predicted);
    expect(m.total).toBe(2);
    expect(m.matched).toBe(1);
    expect(m.accuracy).toBe(1);
  });

  it("reports unknown share among matched rows", () => {
    const gold: GoldLabel[] = [
      { i: 0, role: "body" },
      { i: 1, role: "body" },
    ];
    const predicted = new Map<number, Role>([
      [0, "body"],
      [1, "unknown"],
    ]);
    const m = computeMetrics(gold, predicted);
    expect(m.unknownCount).toBe(1);
    expect(m.unknownShare).toBeCloseTo(0.5);
  });

  it("returns null accuracy/unknownShare when nothing matched", () => {
    const gold: GoldLabel[] = [{ i: 0, role: "body" }];
    const m = computeMetrics(gold, new Map());
    expect(m.accuracy).toBeNull();
    expect(m.unknownShare).toBeNull();
    expect(m.matched).toBe(0);
  });
});
