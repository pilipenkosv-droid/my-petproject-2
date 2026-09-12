/**
 * The restyle step, wired together.
 *
 * Order matters: styles first (so w:pStyle references resolve), then page
 * geometry, then every classified paragraph, then tables. Nothing here computes
 * or checks a fidelity fingerprint — the gate is a separate step that wraps
 * this one.
 */

import { children, findChild, getAttr, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { RulePack } from "@/lib/pipeline-v6/rule-packs/types";
import type { DocxPackage } from "../docx/package";
import { emptyHistogram, type ClassificationResult, type Role } from "../classify/types";
import { STYLES_PART, upsertCanonicalStyles } from "./styles-writer";
import { restyleSections } from "./sections";
import { restyleParagraph } from "./paragraph";
import { restyleRuns } from "./runs";
import { restyleTables } from "./tables";
import { buildPackSpec } from "./spec";

export interface RestyleStats {
  paragraphsTouched: number;
  runsTouched: number;
  sectionsTouched: number;
  stylesUpserted: number;
  /** First table rows that gained a w:tblHeader. */
  tblHeaderSet: number;
  /** Direct w:u properties dropped (every role but toc / title_page). */
  underlineRemoved: number;
  byRole: Record<Role, number>;
  /** The package carries no word/styles.xml; canonical styles were skipped. */
  stylesPartMissing: boolean;
}

/**
 * Character styles that set a font or a size. A w:rStyle pointing at one of
 * them silently overrides the pack, so those references are dropped; character
 * styles that only carry emphasis or colour semantics are left alone.
 */
async function fontCharStyleIds(pkg: DocxPackage): Promise<Set<string>> {
  const out = new Set<string>();
  const nodes = await pkg.part(STYLES_PART);
  const root = nodes?.find((n) => "w:styles" in n);
  for (const style of root ? children(root) : []) {
    if (!("w:style" in style)) continue;
    if (getAttr(style, "w:type") !== "character") continue;
    const id = getAttr(style, "w:styleId");
    const rPr = findChild(style, "w:rPr");
    if (!id || !rPr) continue;
    const sets = (tag: string) => findChild(rPr, tag) !== undefined;
    if (sets("w:rFonts") || sets("w:sz") || sets("w:szCs")) out.add(id);
  }
  return out;
}

/** Carries node-level facts the aux step needs and the report must not hold. */
export interface RestyleSink {
  /** Paragraphs that gained a w:pageBreakBefore they did not have. */
  addedPageBreak: Set<OrderedXmlNode>;
}

export function emptySink(): RestyleSink {
  return { addedPageBreak: new Set() };
}

/** True when the paragraph's own w:pPr carries a w:sectPr. */
function endsSection(node: OrderedXmlNode): boolean {
  const pPr = findChild(node, "w:pPr");
  return pPr !== undefined && children(pPr).some((c) => "w:sectPr" in c);
}

export async function restyleDocument(
  pkg: DocxPackage,
  pack: RulePack,
  classification: ClassificationResult,
  sink: RestyleSink = emptySink()
): Promise<RestyleStats> {
  const spec = buildPackSpec(pack);
  const fontStyleIds = await fontCharStyleIds(pkg);
  const styles = await upsertCanonicalStyles(pkg, pack);
  const sectionsTouched = await restyleSections(pkg, pack, spec);

  const byRole = emptyHistogram();
  let paragraphsTouched = 0;
  let runsTouched = 0;
  const dirty = new Set<string>();
  const counters = { underlineRemoved: 0 };
  const ctx = { spec, prevHasSectPr: false, addedPageBreak: sink.addedPageBreak };
  let prevPart = "";
  for (const cp of classification.list) {
    const node: OrderedXmlNode = cp.node;
    ctx.prevHasSectPr = cp.part === prevPart && ctx.prevHasSectPr;
    if (restyleParagraph(node, cp.role, pack, ctx)) paragraphsTouched += 1;
    runsTouched += restyleRuns(node, cp.role, pack, { spec, fontStyleIds, counters });
    byRole[cp.role] += 1;
    dirty.add(cp.part);
    ctx.prevHasSectPr = endsSection(node);
    prevPart = cp.part;
  }
  for (const part of dirty) pkg.markDirty(part);
  const tables = await restyleTables(pkg, pack, classification);

  return {
    paragraphsTouched,
    runsTouched,
    sectionsTouched,
    stylesUpserted: styles.upserted,
    tblHeaderSet: tables.headerRows,
    underlineRemoved: counters.underlineRemoved,
    byRole,
    stylesPartMissing: styles.missingPart,
  };
}

export { restyleParagraph } from "./paragraph";
export { restyleRuns } from "./runs";
export { restyleSections, restyleSectionsIn } from "./sections";
export { restyleTables, restyleTable, setHeaderRow } from "./tables";
export { upsertCanonicalStyles } from "./styles-writer";
export { buildPackSpec, STYLE_IDS } from "./spec";
