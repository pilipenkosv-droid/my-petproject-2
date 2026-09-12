/**
 * A4 recognition, shared by the restyler and the fingerprint.
 *
 * The restyler normalises a page that is *almost* A4 (11900×16840, 11910×16840
 * — what Word writes after a round trip through another unit system) to exact
 * A4, and leaves every other sheet alone: forcing an A3 foldout or a Letter
 * page to A4 reflows the document and is not a formatting fix.
 *
 * The fingerprint uses the same predicate, so that normalisation is invisible
 * to the gate while a genuine page-size change is not.
 */

/** A4 in twips. */
export const A4_TW = { w: 11906, h: 16838 } as const;

/** One millimetre in twips (1440 twips per inch, 25.4 mm per inch). */
export const MM_TW = 56.6929;

function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

/** True when w×h is within `toleranceMm` of A4 in either orientation. */
export function isNearA4(w: number, h: number, toleranceMm = 1): boolean {
  const tol = toleranceMm * MM_TW;
  return (
    (near(w, A4_TW.w, tol) && near(h, A4_TW.h, tol)) ||
    (near(w, A4_TW.h, tol) && near(h, A4_TW.w, tol))
  );
}

/**
 * The page size as the fingerprint records it: rounded to 10 twips, or snapped
 * to exact A4 when it lies inside the normalisation window.
 */
export function printPgSz(w: number, h: number): { w: number; h: number } {
  if (isNearA4(w, h)) {
    return w >= h ? { w: A4_TW.h, h: A4_TW.w } : { w: A4_TW.w, h: A4_TW.h };
  }
  const round10 = (v: number) => Math.round(v / 10) * 10;
  return { w: round10(w), h: round10(h) };
}
