/**
 * Residue selection: which T0 verdicts are worth spending an LLM call on.
 *
 * Being unsure is not enough — an ordinary sentence the rules left as
 * `unknown` is just body text. A paragraph earns a call only when its
 * formatting hints that it might be structural: short, bold, centred, capsed,
 * kept with the next block, or set in a size unlike the body.
 */

import type { ClassificationResult, ClassifiedParagraph } from "./types";

const MAX_LEN = 200;
const CONFIDENCE_FLOOR = 0.85;
const SIZE_DELTA = 2;
const LEADING_NUMBER_RE = /^\d+(?:\.\d+)*\.?\s/u;

function isStructurallyInteresting(
  cp: ClassifiedParagraph,
  next: ClassifiedParagraph | undefined,
  modalSize: number | undefined
): boolean {
  const f = cp.features;
  if (!f) return false;
  if ((cp.text ?? "").length > MAX_LEN) return false;
  const sizeOff =
    modalSize !== undefined && f.sz !== undefined && Math.abs(f.sz - modalSize) >= SIZE_DELTA;
  return (
    f.boldAll ||
    f.capsRatio >= 0.8 ||
    LEADING_NUMBER_RE.test(cp.text ?? "") ||
    f.jc === "center" ||
    f.keepNext ||
    sizeOff ||
    (next !== undefined && next.part === cp.part && next.role === "empty")
  );
}

/** Paragraphs the LLM residue layer should look at, in document order. */
export function candidatesForLlm(result: ClassificationResult): ClassifiedParagraph[] {
  const out: ClassifiedParagraph[] = [];
  for (let i = 0; i < result.list.length; i++) {
    const cp = result.list[i];
    if (cp.role !== "unknown" && cp.confidence >= CONFIDENCE_FLOOR) continue;
    if (isStructurallyInteresting(cp, result.list[i + 1], result.modalBodySize)) out.push(cp);
  }
  return out;
}
