/**
 * The five structural allowances A1-A3, A5-A6 in mechanical form.
 *
 * Every allowance is a budget, never a blanket permission: what the restyler is
 * allowed to add or drop is bounded by the blocks it actually marked (A1) or
 * was allowed to remove (A2, A3). Anything beyond the budget is a violation.
 */

import { auxKind } from "./normalize";
import type { BlockPrint, Fingerprint, Marker, PartPrint } from "./types";

/** Markers an aux-marked insertion may introduce, by marker kind. */
const INSERT_MARKERS: Record<"toc" | "caption", Marker[]> = {
  toc: ["w:bookmarkStart", "w:fldChar[begin]", "w:instrText", "w:fldSimple", "w:sdt"],
  caption: ["w:bookmarkStart"],
};

const TOC_STYLE = /^(TOC|toc|Оглавление)\d$/;
const TOC_HEADING = /^(СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ)$/i;

export interface Budget {
  markers: Map<Marker, number>;
  fields: Map<string, number>;
  bookmarks: Set<string>;
}

function emptyBudget(): Budget {
  return { markers: new Map(), fields: new Map(), bookmarks: new Set() };
}

function addBlock(budget: Budget, block: BlockPrint, only?: Marker[]): void {
  for (const [marker, n] of Object.entries(block.markers ?? {}) as [Marker, number][]) {
    if (only && !only.includes(marker)) continue;
    budget.markers.set(marker, (budget.markers.get(marker) ?? 0) + n);
  }
  for (const instr of block.fields ?? []) budget.fields.set(instr, (budget.fields.get(instr) ?? 0) + 1);
  for (const name of block.bookmarkNames ?? []) budget.bookmarks.add(name);
}

export function budgetOf(blocks: BlockPrint[], only?: Marker[]): Budget {
  const budget = emptyBudget();
  for (const block of blocks) addBlock(budget, block, only);
  return budget;
}

/** The markers an aux-marked block may legitimately bring, by its range kinds. */
function allowedMarkersFor(block: BlockPrint): Marker[] {
  const kinds = new Set((block.auxRanges ?? []).map(auxKind).filter(Boolean) as ("toc" | "caption")[]);
  const out = new Set<Marker>();
  for (const kind of kinds) for (const marker of INSERT_MARKERS[kind]) out.add(marker);
  return [...out];
}

/**
 * A1: removes every block sitting inside a `_dpx_aux_*` bookmark range from the
 * "after" fingerprint, and returns them as the insertion budget.
 */
export function stripAux(after: Fingerprint): { fingerprint: Fingerprint; stripped: Record<string, BlockPrint[]> } {
  const parts: Record<string, PartPrint> = {};
  const stripped: Record<string, BlockPrint[]> = {};
  for (const [name, part] of Object.entries(after.parts)) {
    const marked = part.blocks.filter((b) => (b.auxRanges ?? []).length > 0);
    stripped[name] = marked;
    parts[name] = marked.length ? { ...part, blocks: part.blocks.filter((b) => !marked.includes(b)) } : part;
  }
  return { fingerprint: { ...after, parts }, stripped };
}

export function insertBudget(marked: BlockPrint[]): Budget {
  const budget = emptyBudget();
  for (const block of marked) addBlock(budget, block, allowedMarkersFor(block));
  return budget;
}

/** Maximal runs of consecutive indices. */
export function contiguousRuns(indices: number[]): number[][] {
  const sorted = [...indices].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const i of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else runs.push([i]);
  }
  return runs;
}

function isTocBlock(block: BlockPrint): boolean {
  if (block.inTocField) return true;
  if (block.kind === "p") return block.pStyle !== undefined && TOC_STYLE.test(block.pStyle);
  return block.shape.rows.length > 0 && block.shape.rows.every((r) => r.cells.length === 2);
}

function nearHeading(blocks: BlockPrint[], run: number[]): boolean {
  const isHeading = (b: BlockPrint | undefined) => b?.kind === "p" && TOC_HEADING.test(b.text);
  return isHeading(blocks[run[0] - 1]) || isHeading(blocks[run[run.length - 1] + 1]);
}

/**
 * A2: at most one contiguous run of TOC blocks adjacent to a
 * "СОДЕРЖАНИЕ"/"ОГЛАВЛЕНИЕ" heading may be removed. Returns the run it allows.
 */
export function findTocRun(before: PartPrint, removed: number[]): number[] | null {
  for (const run of contiguousRuns(removed)) {
    if (run.every((i) => isTocBlock(before.blocks[i])) && nearHeading(before.blocks, run)) return run;
  }
  return null;
}

/** A3: a paragraph that carries nothing but its own emptiness. */
export function isRemovableEmpty(block: BlockPrint): boolean {
  return (
    block.kind === "p" &&
    block.text === "" &&
    !block.hasDrawing &&
    !block.hasEmbed &&
    !block.hasSectPr &&
    !block.hasAnchor &&
    !block.onlyInCell &&
    !block.lastBody
  );
}

export function emptyRemovalCap(part: PartPrint): number {
  const paragraphs = part.blocks.filter((b) => b.kind === "p").length;
  return Math.min(30, Math.floor(0.05 * paragraphs));
}
