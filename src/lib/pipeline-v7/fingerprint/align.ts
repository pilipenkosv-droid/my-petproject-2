/**
 * Myers O(n·d) sequence alignment.
 *
 * A restyler's block list changes by a handful of edits at most, so d stays
 * tiny; trimming the common prefix and suffix first keeps the search window
 * small even for a 5000-block document. Beyond MAX_D the middle is reported as
 * a wholesale replace — a gate verdict is still correct, only less precise.
 */

export type AlignOp =
  | { op: "equal"; a: number; b: number }
  | { op: "delete"; a: number }
  | { op: "insert"; b: number };

const MAX_D = 1500;

function backtrack(trace: Int32Array[], n: number, m: number, off: number): AlignOp[] {
  const ops: AlignOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]);
    const kPrev = down ? k + 1 : k - 1;
    const xStart = v[off + kPrev];
    const yStart = xStart - kPrev;
    const xMid = down ? xStart : xStart + 1;
    const yMid = xMid - k;
    while (x > xMid && y > yMid) {
      x -= 1;
      y -= 1;
      ops.push({ op: "equal", a: x, b: y });
    }
    if (d > 0) {
      if (down) ops.push({ op: "insert", b: --y });
      else ops.push({ op: "delete", a: --x });
    }
    x = xStart;
    y = yStart;
  }
  return ops.reverse();
}

function myers(a: string[], b: string[], maxD: number): AlignOp[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(maxD, n + m);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  v[off + 1] = 0;
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m, off);
    }
  }
  return null;
}

function replaceAll(n: number, m: number, aFrom: number, bFrom: number): AlignOp[] {
  const ops: AlignOp[] = [];
  for (let i = 0; i < n; i++) ops.push({ op: "delete", a: aFrom + i });
  for (let j = 0; j < m; j++) ops.push({ op: "insert", b: bFrom + j });
  return ops;
}

/** Aligns two key sequences; the result covers every index of both inputs. */
export function alignSequences(a: string[], b: string[], maxD = MAX_D): AlignOp[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail += 1;
  }
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const ops: AlignOp[] = [];
  for (let i = 0; i < head; i++) ops.push({ op: "equal", a: i, b: i });
  const mid = midA.length && midB.length ? myers(midA, midB, maxD) : null;
  if (mid) {
    for (const op of mid) {
      if (op.op === "equal") ops.push({ op: "equal", a: op.a + head, b: op.b + head });
      else if (op.op === "delete") ops.push({ op: "delete", a: op.a + head });
      else ops.push({ op: "insert", b: op.b + head });
    }
  } else {
    ops.push(...replaceAll(midA.length, midB.length, head, head));
  }
  for (let i = 0; i < tail; i++) ops.push({ op: "equal", a: a.length - tail + i, b: b.length - tail + i });
  return ops;
}
