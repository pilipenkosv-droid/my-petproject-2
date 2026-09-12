/**
 * Structural diff of two fingerprints.
 *
 * The block sequences are aligned with Myers on the key `kind+text`, so one
 * insertion shifts nothing: it is reported as a single insertion instead of
 * cascading into N text changes. A deletion run immediately followed by an
 * insertion run is re-paired into `text-changed` when the two texts are
 * recognisably the same paragraph.
 */

import { alignSequences, type AlignOp } from "./align";
import { looseEqual } from "./normalize";
import { MARKERS, type BlockPrint, type Fingerprint, type Marker, type PartPrint } from "./types";

export type FidelityEntry =
  | { kind: "count"; part: string; marker: Marker; before: number; after: number }
  | { kind: "block-removed"; part: string; index: number; block: BlockPrint }
  | { kind: "block-inserted"; part: string; index: number; block: BlockPrint }
  | { kind: "text-changed"; part: string; index: number; before: string; after: string; path: string }
  | {
      kind: "table-shape";
      part: string;
      index: number;
      /** Everything but the grid width total is identical (A5 candidate). */
      onlyGridColSum: boolean;
      /** Relative change of the grid width total, 0..1. */
      gridColSumDelta: number;
    }
  | { kind: "section"; part: string; index: number; field: string }
  | { kind: "field"; part: string; instr: string; before: number; after: number }
  | { kind: "bookmark-missing"; part: string; name: string }
  | { kind: "part-missing"; part: string }
  | { kind: "part-added"; part: string }
  | { kind: "media"; name: string; before: string | null; after: string | null }
  | { kind: "rel"; target: string; before: boolean; after: boolean }
  | { kind: "embedding"; before: number; after: number };

export interface FidelityDiff {
  entries: FidelityEntry[];
}

export function blockKey(b: BlockPrint): string {
  return b.kind === "p" ? `p ${b.text}` : `tbl ${b.depth}`;
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Dice coefficient on character bigrams - cheap and good enough for re-pairing. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared += 1;
  return (2 * shared) / (x.size + y.size);
}

function pairable(a: BlockPrint, b: BlockPrint): boolean {
  if (a.kind !== "p" || b.kind !== "p") return false;
  return looseEqual(a.text, b.text) || similarity(a.text, b.text) >= 0.5;
}

function diffCounts(part: string, a: PartPrint, b: PartPrint, out: FidelityEntry[]): void {
  for (const marker of MARKERS) {
    if (a.counts[marker] !== b.counts[marker]) {
      out.push({ kind: "count", part, marker, before: a.counts[marker], after: b.counts[marker] });
    }
  }
}

function diffShapes(part: string, a: BlockPrint, b: BlockPrint, index: number, out: FidelityEntry[]): void {
  if (a.kind !== "tbl" || b.kind !== "tbl") return;
  if (JSON.stringify(a.shape) === JSON.stringify(b.shape)) return;
  const x = a.shape;
  const y = b.shape;
  const onlyGridColSum =
    JSON.stringify({ ...x, gridColSum: 0 }) === JSON.stringify({ ...y, gridColSum: 0 });
  const base = Math.max(x.gridColSum, y.gridColSum, 1);
  out.push({
    kind: "table-shape",
    part,
    index,
    onlyGridColSum,
    gridColSumDelta: Math.abs(x.gridColSum - y.gridColSum) / base,
  });
}

/** Turns a delete-run + insert-run into text-changed pairs where recognisable. */
function emitRun(
  part: string,
  dels: number[],
  inss: number[],
  a: PartPrint,
  b: PartPrint,
  out: FidelityEntry[]
): void {
  const usedIns = new Set<number>();
  const usedDel = new Set<number>();
  for (const di of dels) {
    const match = inss.find((ii) => !usedIns.has(ii) && pairable(a.blocks[di], b.blocks[ii]));
    if (match === undefined) continue;
    usedIns.add(match);
    usedDel.add(di);
    const from = a.blocks[di];
    const to = b.blocks[match];
    out.push({
      kind: "text-changed",
      part,
      index: di,
      before: from.kind === "p" ? from.text : "",
      after: to.kind === "p" ? to.text : "",
      path: from.path,
    });
  }
  for (const di of dels) {
    if (!usedDel.has(di)) out.push({ kind: "block-removed", part, index: di, block: a.blocks[di] });
  }
  for (const ii of inss) {
    if (!usedIns.has(ii)) out.push({ kind: "block-inserted", part, index: ii, block: b.blocks[ii] });
  }
}

function diffBlocks(part: string, a: PartPrint, b: PartPrint, out: FidelityEntry[]): void {
  const ops = alignSequences(a.blocks.map(blockKey), b.blocks.map(blockKey));
  let dels: number[] = [];
  let inss: number[] = [];
  const flush = () => {
    if (dels.length || inss.length) emitRun(part, dels, inss, a, b, out);
    dels = [];
    inss = [];
  };
  for (const op of ops as AlignOp[]) {
    if (op.op === "equal") {
      flush();
      diffShapes(part, a.blocks[op.a], b.blocks[op.b], op.a, out);
    } else if (op.op === "delete") dels.push(op.a);
    else inss.push(op.b);
  }
  flush();
}

const SECTION_FIELDS = [
  "pgSz",
  "orient",
  "colsNum",
  "colsEqualWidth",
  "type",
  "headerRefTypes",
  "footerRefTypes",
  "titlePg",
] as const;

function diffSections(part: string, a: PartPrint, b: PartPrint, out: FidelityEntry[]): void {
  const n = Math.max(a.sections.length, b.sections.length);
  for (let i = 0; i < n; i++) {
    const x = a.sections[i];
    const y = b.sections[i];
    if (!x) {
      out.push({ kind: "section", part, index: i, field: "added" });
    } else if (!y) {
      out.push({ kind: "section", part, index: i, field: "missing" });
    } else {
      for (const f of SECTION_FIELDS) {
        if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) out.push({ kind: "section", part, index: i, field: f });
      }
    }
  }
}

function tally(values: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

function diffFields(part: string, a: PartPrint, b: PartPrint, out: FidelityEntry[]): void {
  const x = tally(a.fieldInstrs);
  const y = tally(b.fieldInstrs);
  for (const instr of new Set([...x.keys(), ...y.keys()])) {
    const before = x.get(instr) ?? 0;
    const after = y.get(instr) ?? 0;
    if (before !== after) out.push({ kind: "field", part, instr, before, after });
  }
  const known = new Set(b.bookmarks);
  for (const name of new Set(a.bookmarks)) {
    if (!known.has(name)) out.push({ kind: "bookmark-missing", part, name });
  }
}

function diffPackage(a: Fingerprint, b: Fingerprint, out: FidelityEntry[]): void {
  const key = (s: string) => s.slice(0, s.lastIndexOf(":"));
  const beforeMedia = new Map(a.packageLevel.mediaFiles.map((m) => [key(m), m]));
  const afterMedia = new Map(b.packageLevel.mediaFiles.map((m) => [key(m), m]));
  for (const name of new Set([...beforeMedia.keys(), ...afterMedia.keys()])) {
    const x = beforeMedia.get(name) ?? null;
    const y = afterMedia.get(name) ?? null;
    if (x !== y) out.push({ kind: "media", name, before: x, after: y });
  }
  const beforeRels = new Set(a.packageLevel.relTargets);
  const afterRels = new Set(b.packageLevel.relTargets);
  for (const target of new Set([...beforeRels, ...afterRels])) {
    const x = beforeRels.has(target);
    const y = afterRels.has(target);
    if (x !== y) out.push({ kind: "rel", target, before: x, after: y });
  }
  if (a.packageLevel.embeddedObjects !== b.packageLevel.embeddedObjects) {
    out.push({ kind: "embedding", before: a.packageLevel.embeddedObjects, after: b.packageLevel.embeddedObjects });
  }
}

export function diffFingerprints(before: Fingerprint, after: Fingerprint): FidelityDiff {
  const entries: FidelityEntry[] = [];
  for (const part of new Set([...Object.keys(before.parts), ...Object.keys(after.parts)])) {
    const a = before.parts[part];
    const b = after.parts[part];
    if (!a) {
      entries.push({ kind: "part-added", part });
      continue;
    }
    if (!b) {
      entries.push({ kind: "part-missing", part });
      continue;
    }
    diffCounts(part, a, b, entries);
    diffBlocks(part, a, b, entries);
    diffSections(part, a, b, entries);
    diffFields(part, a, b, entries);
  }
  diffPackage(before, after, entries);
  return { entries };
}
