/**
 * The fidelity gate: a diff entry is either covered by a named allowance or it
 * is a hard violation. There is no soft tier and no "probably fine" - if the
 * gate cannot name the rule that permits a change, the restyle does not ship.
 */

import {
  budgetOf,
  emptyRemovalCap,
  findTocRun,
  insertBudget,
  isRemovableEmpty,
  stripAux,
  type Budget,
} from "./allowances";
import { diffFingerprints, type FidelityDiff, type FidelityEntry } from "./diff";
import { instrBookmark, instrKeyword, looseEqual } from "./normalize";
import type { BlockPrint, Fingerprint } from "./types";

export type AllowanceRule = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "addition";

export interface GateOptions {
  /** A4: accept text that differs only in quote shapes, dashes and spacing. */
  allowTextNormalization?: boolean;
}

export interface GateViolation {
  kind: string;
  severity: "hard";
  message: string;
  entry?: FidelityEntry;
}

export interface AllowedDiff {
  rule: AllowanceRule;
  message: string;
  entry?: FidelityEntry;
}

export interface GateResult {
  pass: boolean;
  violations: GateViolation[];
  allowed: AllowedDiff[];
  diff: FidelityDiff;
}

export class FidelityGateError extends Error {
  constructor(
    message: string,
    readonly diff: FidelityDiff
  ) {
    super(message);
    this.name = "FidelityGateError";
  }
}

class Verdict {
  readonly violations: GateViolation[] = [];
  readonly allowed: AllowedDiff[] = [];

  deny(kind: string, message: string, entry?: FidelityEntry): void {
    this.violations.push({ kind, severity: "hard", message, entry });
  }

  permit(rule: AllowanceRule, message: string, entry?: FidelityEntry): void {
    this.allowed.push({ rule, message, entry });
  }
}

function where(block: BlockPrint): string {
  return block.kind === "p" ? `${block.path} (абзац)` : `${block.path} (таблица)`;
}

/** A2 + A3: decides which removals are permitted; returns the blocks they cover. */
function judgeRemovals(
  part: string,
  before: Fingerprint,
  entries: Extract<FidelityEntry, { kind: "block-removed" }>[],
  v: Verdict
): BlockPrint[] {
  const beforePart = before.parts[part];
  const tocRun = findTocRun(beforePart, entries.map((e) => e.index));
  const cap = emptyRemovalCap(beforePart);
  const covered: BlockPrint[] = [];
  let empties = 0;
  for (const entry of entries) {
    if (tocRun?.includes(entry.index)) {
      covered.push(entry.block);
      v.permit("A2", `${part}: удалён блок старого оглавления ${where(entry.block)}`, entry);
    } else if (isRemovableEmpty(entry.block)) {
      empties += 1;
      if (empties <= cap) {
        covered.push(entry.block);
        v.permit("A3", `${part}: удалён пустой абзац ${where(entry.block)}`, entry);
      }
    } else {
      v.deny("block-removed", `${part}: удалён блок ${where(entry.block)}`, entry);
    }
  }
  if (empties > cap) {
    v.deny("empty-removal-cap", `${part}: удалено пустых абзацев ${empties}, лимит ${cap}`);
  }
  return covered;
}

function judgeCount(
  entry: Extract<FidelityEntry, { kind: "count" }>,
  inserted: Budget,
  removed: Budget,
  v: Verdict
): void {
  const delta = entry.after - entry.before;
  const budget = delta > 0 ? inserted : removed;
  const cap = budget.markers.get(entry.marker) ?? 0;
  const head = `${entry.part}: ${entry.marker} ${entry.before} → ${entry.after}`;
  if (Math.abs(delta) <= cap) {
    v.permit(delta > 0 ? "A1" : "A2", `${head} — в пределах бюджета разрешённых блоков`, entry);
  } else {
    v.deny("count", `${head}, разрешено не более ${cap}`, entry);
  }
}

/** A6: PAGE/NUMPAGES/TOC are presentation; every other instruction must match. */
const FREE_FIELDS = new Set(["PAGE", "NUMPAGES", "TOC"]);

function judgeField(
  entry: Extract<FidelityEntry, { kind: "field" }>,
  inserted: Budget,
  removed: Budget,
  v: Verdict
): void {
  const head = `${entry.part}: поле ${entry.instr} ${entry.before} → ${entry.after}`;
  if (FREE_FIELDS.has(instrKeyword(entry.instr))) {
    v.permit("A6", `${head} — служебное поле`, entry);
    return;
  }
  const delta = entry.after - entry.before;
  const cap = (delta > 0 ? inserted : removed).fields.get(entry.instr) ?? 0;
  if (Math.abs(delta) <= cap) v.permit("A6", `${head} — в пределах бюджета`, entry);
  else v.deny("field", `${head}, разрешено не более ${cap}`, entry);
}

/** A6: every REF/PAGEREF/NOTEREF left in the result must still resolve. */
function checkDanglingRefs(after: Fingerprint, v: Verdict): void {
  const known = new Set<string>();
  // Instruction arguments are uppercased by normalizeInstr, and Word treats
  // bookmark names case-insensitively, so the lookup is uppercase on both sides.
  for (const part of Object.values(after.parts)) for (const name of part.bookmarks) known.add(name.toUpperCase());
  for (const [name, part] of Object.entries(after.parts)) {
    for (const instr of part.fieldInstrs) {
      const target = instrBookmark(instr);
      if (target && !known.has(target)) {
        v.deny("dangling-ref", `${name}: поле ${instr} ссылается на исчезнувшую закладку ${target}`);
      }
    }
  }
}

function judgePackage(entry: FidelityEntry, v: Verdict): void {
  if (entry.kind === "media") {
    if (entry.after === null) v.deny("media", `потерян медиафайл ${entry.name}`, entry);
    else if (entry.before === null) v.permit("addition", `добавлен медиафайл ${entry.name}`, entry);
    else v.deny("media", `медиафайл ${entry.name} изменился: ${entry.before} → ${entry.after}`, entry);
  } else if (entry.kind === "rel") {
    if (entry.before && !entry.after) v.deny("rel", `потеряна связь ${entry.target}`, entry);
    else v.permit("addition", `добавлена связь ${entry.target}`, entry);
  } else if (entry.kind === "embedding") {
    if (entry.after < entry.before) {
      v.deny("embedding", `внедрённых объектов ${entry.before} → ${entry.after}`, entry);
    } else v.permit("addition", `внедрённых объектов ${entry.before} → ${entry.after}`, entry);
  } else {
    v.deny(entry.kind, `неклассифицированное расхождение: ${JSON.stringify(entry)}`, entry);
  }
}

function judgeRest(entry: FidelityEntry, opts: GateOptions, v: Verdict): void {
  switch (entry.kind) {
    case "block-inserted":
      v.deny("block-inserted", `${entry.part}: вставлен неразмеченный блок ${where(entry.block)}`, entry);
      return;
    case "text-changed": {
      const ok = opts.allowTextNormalization === true && looseEqual(entry.before, entry.after);
      const head = `${entry.part} ${entry.path}: «${entry.before}» → «${entry.after}»`;
      if (ok) v.permit("A4", `${head} — только нормализация`, entry);
      else v.deny("text-changed", head, entry);
      return;
    }
    case "table-shape":
      v.deny("table-shape", `${entry.part}: изменилась структура таблицы #${entry.index}`, entry);
      return;
    case "section":
      v.deny("section", `${entry.part}: секция #${entry.index}, поле ${entry.field}`, entry);
      return;
    case "part-missing":
      v.deny("part-missing", `потеряна часть документа ${entry.part}`, entry);
      return;
    case "part-added":
      v.permit("addition", `добавлена часть документа ${entry.part}`, entry);
      return;
    default:
      judgePackage(entry, v);
  }
}

function removalsOf(entries: FidelityEntry[], part: string): Extract<FidelityEntry, { kind: "block-removed" }>[] {
  return entries.filter(
    (e): e is Extract<FidelityEntry, { kind: "block-removed" }> => e.kind === "block-removed" && e.part === part
  );
}

export function evaluateGate(before: Fingerprint, after: Fingerprint, opts: GateOptions = {}): GateResult {
  const { fingerprint: stripped, stripped: marked } = stripAux(after);
  const diff = diffFingerprints(before, stripped);
  const v = new Verdict();
  const parts = new Set(diff.entries.map((e) => ("part" in e ? e.part : "")).filter(Boolean));

  const budgets = new Map<string, { inserted: Budget; removed: Budget }>();
  for (const part of parts) {
    const removed = before.parts[part] ? judgeRemovals(part, before, removalsOf(diff.entries, part), v) : [];
    budgets.set(part, { inserted: insertBudget(marked[part] ?? []), removed: budgetOf(removed) });
  }

  for (const entry of diff.entries) {
    const budget = "part" in entry ? budgets.get(entry.part) : undefined;
    if (entry.kind === "block-removed") continue;
    if (entry.kind === "count" && budget) judgeCount(entry, budget.inserted, budget.removed, v);
    else if (entry.kind === "field" && budget) judgeField(entry, budget.inserted, budget.removed, v);
    else if (entry.kind === "bookmark-missing") {
      const ok = budget?.removed.bookmarks.has(entry.name) ?? false;
      if (ok) v.permit("A2", `${entry.part}: закладка ${entry.name} удалена вместе с блоком`, entry);
      else v.deny("bookmark-missing", `${entry.part}: пропала закладка ${entry.name}`, entry);
    } else judgeRest(entry, opts, v);
  }
  checkDanglingRefs(after, v);

  return { pass: v.violations.length === 0, violations: v.violations, allowed: v.allowed, diff };
}

/** Throws FidelityGateError unless the gate passes. */
export function assertGate(before: Fingerprint, after: Fingerprint, opts: GateOptions = {}): GateResult {
  const result = evaluateGate(before, after, opts);
  if (!result.pass) {
    const head = result.violations.map((x) => x.message).join("; ");
    throw new FidelityGateError(`pipeline-v7: нарушена точность документа — ${head}`, result.diff);
  }
  return result;
}
