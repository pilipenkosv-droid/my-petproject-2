/**
 * Page geometry — the only two w:sectPr children the restyler is allowed to
 * touch. w:cols, w:type, header/footer references and w:titlePg carry the
 * student's own layout decisions and are left exactly as found.
 */

import type { RulePack } from "@/lib/pipeline-v6/rule-packs/types";
import type { OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { DocxPackage } from "../docx/package";
import { enumerateSectPr, getOrient, getPgSz, setPgMar, setPgSz } from "../docx/sectpr";
import { isNearA4 } from "../docx/paper";
import type { PgMar } from "../types";
import { buildPackSpec, mmToTwips, type PackSpec } from "./spec";

/**
 * Margins for one section.
 *
 * A landscape section is the same sheet turned 90°, so the edge that sits in
 * the binding moves from left to top. Rotating the margins with the sheet keeps
 * the bound edge at its 30 mm and stops landscape pages from printing into the
 * staples.
 */
export function marginsFor(spec: PackSpec, orient: "portrait" | "landscape"): PgMar {
  const m = spec.marginsMm;
  const mm = orient === "landscape"
    ? { top: m.left, bottom: m.right, left: m.top, right: m.bottom }
    : m;
  return {
    top: String(mmToTwips(mm.top)),
    bottom: String(mmToTwips(mm.bottom)),
    left: String(mmToTwips(mm.left)),
    right: String(mmToTwips(mm.right)),
  };
}

/**
 * True when the section's page is A4 give or take a millimetre — the only case
 * where writing the pack's page size is a normalisation rather than a reflow.
 *
 * A section printed on A3, A5 or Letter was set that way on purpose (a foldout
 * table, an American template); forcing it to A4 repaginates the document and
 * is not a formatting fix. A section with no w:pgSz at all inherits the
 * application default and is left alone for the same reason.
 */
function normalisablePage(sectPr: OrderedXmlNode): boolean {
  const size = getPgSz(sectPr);
  const w = Number(size?.w);
  const h = Number(size?.h);
  return Number.isFinite(w) && Number.isFinite(h) && isNearA4(w, h);
}

export function restyleSectPr(sectPr: OrderedXmlNode, spec: PackSpec): void {
  const orient = getOrient(sectPr);
  // Margins apply to every section: they are the pack's, whatever the sheet.
  setPgMar(sectPr, marginsFor(spec, orient));
  if (!normalisablePage(sectPr)) return;
  const { w, h } = spec.pageMm;
  const [pw, ph] = orient === "landscape" ? [h, w] : [w, h];
  // orient is deliberately not passed: an absent w:orient means portrait and
  // must stay absent, and an existing one is already correct.
  setPgSz(sectPr, mmToTwips(pw), mmToTwips(ph));
}

/** Applies the pack's page geometry to every live sectPr of one part. */
export function restyleSectionsIn(part: OrderedXmlNode[] | OrderedXmlNode, spec: PackSpec): number {
  const refs = enumerateSectPr(part);
  for (const ref of refs) restyleSectPr(ref.node, spec);
  return refs.length;
}

/**
 * Applies the page geometry across the package. Only the main document part
 * carries live sectPr; headers and footers inherit from it.
 */
export async function restyleSections(
  pkg: DocxPackage,
  pack: RulePack,
  spec: PackSpec = buildPackSpec(pack)
): Promise<number> {
  let touched = 0;
  for (const ref of await pkg.contentParts()) {
    if (ref.kind !== "document") continue;
    const nodes = await pkg.part(ref.name);
    if (!nodes) continue;
    const n = restyleSectionsIn(nodes, spec);
    if (n > 0) pkg.markDirty(ref.name);
    touched += n;
  }
  return touched;
}
