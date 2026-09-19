/**
 * Pure metric math for `bench-roles.ts` — kept separate so it can be unit
 * tested with a small fixture, without loading a docx or calling the LLM.
 */
import type { Role } from "@/lib/pipeline-v7/classify/types";

export interface GoldLabel {
  i: number;
  role: Role;
}

export interface RolePrecisionRecall {
  role: Role;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
}

export interface RoleMetrics {
  total: number;
  matched: number;
  correct: number;
  accuracy: number | null;
  unknownCount: number;
  unknownShare: number | null;
  perRole: RolePrecisionRecall[];
  /** "gold|predicted" -> count. */
  confusion: Map<string, number>;
}

/**
 * `predicted` maps a paragraph index (same indexing as `gold[].i`, i.e.
 * position in `ClassificationResult.list`) to the role the classifier
 * assigned. A gold row with no prediction (index missing from `predicted`,
 * e.g. the document was re-paginated) is skipped and does not count toward
 * `total`.
 */
export function computeMetrics(gold: GoldLabel[], predicted: Map<number, Role>): RoleMetrics {
  const confusion = new Map<string, number>();
  const tpByRole = new Map<Role, number>();
  const fpByRole = new Map<Role, number>();
  const fnByRole = new Map<Role, number>();
  const roles = new Set<Role>();

  let matched = 0;
  let correct = 0;
  let unknownCount = 0;

  for (const g of gold) {
    const got = predicted.get(g.i);
    if (got === undefined) continue;
    matched++;
    roles.add(g.role);
    roles.add(got);
    if (got === "unknown") unknownCount++;

    const key = `${g.role}|${got}`;
    confusion.set(key, (confusion.get(key) ?? 0) + 1);

    if (got === g.role) {
      correct++;
      tpByRole.set(g.role, (tpByRole.get(g.role) ?? 0) + 1);
    } else {
      fnByRole.set(g.role, (fnByRole.get(g.role) ?? 0) + 1);
      fpByRole.set(got, (fpByRole.get(got) ?? 0) + 1);
    }
  }

  const perRole: RolePrecisionRecall[] = [...roles]
    .sort()
    .map((role) => {
      const tp = tpByRole.get(role) ?? 0;
      const fp = fpByRole.get(role) ?? 0;
      const fn = fnByRole.get(role) ?? 0;
      return {
        role,
        tp,
        fp,
        fn,
        precision: tp + fp > 0 ? tp / (tp + fp) : null,
        recall: tp + fn > 0 ? tp / (tp + fn) : null,
      };
    });

  return {
    total: gold.length,
    matched,
    correct,
    accuracy: matched > 0 ? correct / matched : null,
    unknownCount,
    unknownShare: matched > 0 ? unknownCount / matched : null,
    perRole,
    confusion,
  };
}
