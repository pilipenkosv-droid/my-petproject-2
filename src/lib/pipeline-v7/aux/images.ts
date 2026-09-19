/**
 * Shrinking pictures that run off the text column.
 *
 * A student pastes a screenshot at its native size and Word keeps it: the
 * drawing is wider than the printable column, so it either spills into the
 * margin or Word rescales it at layout time and the file still says the wrong
 * number. The checker reads the number (`wp:extent@cx`), so the file has to be
 * right, not merely render right.
 *
 * Only the geometry changes, and only downwards. The aspect ratio is kept by
 * scaling `cy` with the same factor, and the same factor is applied to the
 * `a:ext` inside the shape properties — `wp:extent` sizes the box the drawing
 * occupies in the text flow, `a:ext` sizes the shape inside it, and moving one
 * without the other is how a picture ends up cropped.
 *
 * Fidelity: the fingerprint records only that a paragraph *has* a drawing
 * (`blocks.ts`, `hasDrawing`), never its size, so this step is invisible to the
 * gate and needs no allowance.
 */

import { children, getAttr, setAttr, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { enumerateSectPr, getPgMar, getPgSz } from "../docx/sectpr";
import type { DocxPackage } from "../docx/package";

const EMU_PER_TWIP = 635;

/**
 * The checker's own ceiling: 165 mm, whatever the pack's margins say.
 *
 * It has to be honoured alongside the section's real text width because the
 * two disagree — ГОСТ 7.32 leaves a 10 mm right margin, so the column is
 * 170 mm wide and a 168 mm picture fits the page and still fails the rule.
 * Clamping to the narrower of the two is the only cap that both prints inside
 * the margins and passes.
 */
const CHECKER_MAX_EMU = 165 * 36000;

/** Text width of the first section, in EMU; the ГОСТ A4 column as a fallback. */
async function textWidthEmu(pkg: DocxPackage): Promise<number> {
  const ref = (await pkg.contentParts()).find((r) => r.kind === "document");
  const nodes = ref ? await pkg.part(ref.name) : undefined;
  const sectPr = nodes ? enumerateSectPr(nodes)[0]?.node : undefined;
  if (!sectPr) return CHECKER_MAX_EMU;
  const size = getPgSz(sectPr);
  const mar = getPgMar(sectPr);
  const w = Number(size?.w);
  const left = Number(mar?.left ?? 0);
  const right = Number(mar?.right ?? 0);
  const tw = w - (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
  return Number.isFinite(tw) && tw > 0 ? tw * EMU_PER_TWIP : CHECKER_MAX_EMU;
}

/** Multiplies `cx`/`cy` of one extent-shaped node, rounding to whole EMU. */
function scaleExtent(node: OrderedXmlNode, factor: number): void {
  for (const attr of ["cx", "cy"] as const) {
    const v = Number(getAttr(node, attr));
    if (!Number.isFinite(v) || v <= 0) continue;
    setAttr(node, attr, String(Math.max(1, Math.round(v * factor))));
  }
}

/** Every `a:ext` under this container — the shape's own size, inside the box. */
function scaleShapeExtents(node: OrderedXmlNode, factor: number): void {
  for (const child of children(node)) {
    if (tagName(child) === "a:ext") scaleExtent(child, factor);
    else scaleShapeExtents(child, factor);
  }
}

/**
 * Scales down every inline or anchored drawing wider than the cap.
 * Returns how many were rescaled.
 */
export async function scaleImages(pkg: DocxPackage): Promise<number> {
  const cap = Math.min(await textWidthEmu(pkg), CHECKER_MAX_EMU);
  let scaled = 0;
  for (const ref of await pkg.contentParts()) {
    const nodes = await pkg.part(ref.name);
    if (!nodes) continue;
    let touched = 0;
    const visit = (node: OrderedXmlNode): void => {
      for (const child of children(node)) {
        const tag = tagName(child);
        if (tag === "wp:inline" || tag === "wp:anchor") {
          const extent = children(child).find((c) => tagName(c) === "wp:extent");
          const cx = extent ? Number(getAttr(extent, "cx")) : NaN;
          if (extent && Number.isFinite(cx) && cx > cap) {
            const factor = cap / cx;
            scaleExtent(extent, factor);
            // wp:effectExtent is a margin around the box, not a size: left
            // alone on purpose, it is measured from the edges either way.
            scaleShapeExtents(child, factor);
            touched += 1;
          }
        }
        if (tag !== undefined) visit(child);
      }
    };
    for (const node of nodes) visit(node);
    if (touched > 0) pkg.markDirty(ref.name);
    scaled += touched;
  }
  return scaled;
}
