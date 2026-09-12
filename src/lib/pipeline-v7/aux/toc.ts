/**
 * Inserting a table of contents.
 *
 * The document is never given a second TOC: if one is already there — a TOC
 * field, TOC1..9-styled paragraphs, or the two-column table pandoc leaves next
 * to a "СОДЕРЖАНИЕ" heading — this step does nothing, and removing the old one
 * is left to allowance A2 in a later round.
 *
 * What is inserted is a heading and a complex TOC field with a cached
 * placeholder run, plus w:updateFields in settings.xml so Word and LibreOffice
 * fill the field in on open (LibreOffice honours it on headless convert too).
 * Both paragraphs are wrapped in `_dpx_aux_toc_*` bookmark ranges, which is
 * what makes them invisible to the fidelity gate.
 */

import {
  children,
  createNode,
  createTextNode,
  findChild,
  type OrderedXmlNode,
} from "@/lib/xml/docx-xml";
import { buildBlocks } from "../fingerprint/blocks";
import type { BlockPrint } from "../fingerprint/types";
import type { DocxPackage } from "../docx/package";
import { STYLE_IDS, type PackSpec } from "../restyle/spec";
import { W_SETTINGS_ORDER, setChildInOrder } from "../restyle/ooxml-order";
import { dirOf, mainPart, markAux, nextBookmarkId, titleRegionEnd } from "./common";

const TOC_INSTR = ' TOC \\o "1-3" \\h \\z \\u ';
const TOC_STYLE = /^(TOC|toc|Оглавление|Содержание)\s?\d$/;
const TOC_HEADING = /^(СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ)$/i;

export interface TocResult {
  inserted: boolean;
  /** An existing TOC was found and left in place. */
  existing: boolean;
  updateFields: boolean;
  /** Nothing was inserted because the title region could not be located. */
  skipped?: "no-title-page";
}

function isTocHeading(block: BlockPrint | undefined): boolean {
  return block?.kind === "p" && TOC_HEADING.test(block.text.trim());
}

/** A two-column table pressed against a "СОДЕРЖАНИЕ" heading is a static TOC. */
function isTocTable(blocks: BlockPrint[], i: number): boolean {
  const b = blocks[i];
  if (b.kind !== "tbl" || !b.shape.rows.length) return false;
  if (!b.shape.rows.every((r) => r.cells.length === 2)) return false;
  return isTocHeading(blocks[i - 1]) || isTocHeading(blocks[i + 1]);
}

export function hasExistingToc(nodes: OrderedXmlNode[]): boolean {
  const blocks = buildBlocks(nodes);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.inTocField) return true;
    if ((b.fields ?? []).some((f) => f === "TOC" || f.startsWith("TOC "))) return true;
    if (b.kind === "p" && b.pStyle && TOC_STYLE.test(b.pStyle)) return true;
    if (isTocTable(blocks, i)) return true;
  }
  return false;
}

function rPr(spec: PackSpec): OrderedXmlNode {
  return createNode("w:rPr", undefined, [
    createNode("w:rFonts", { "w:ascii": spec.font, "w:hAnsi": spec.font, "w:cs": spec.font }),
    createNode("w:sz", { "w:val": String(spec.szBody) }),
    createNode("w:szCs", { "w:val": String(spec.szBody) }),
  ]);
}

function headingParagraph(spec: PackSpec): OrderedXmlNode {
  return createNode("w:p", undefined, [
    createNode("w:pPr", undefined, [createNode("w:pStyle", { "w:val": STYLE_IDS.tocTitle })]),
    createNode("w:r", undefined, [
      rPr(spec),
      createNode("w:t", { "xml:space": "preserve" }, [createTextNode(spec.tocTitle.toUpperCase())]),
    ]),
  ]);
}

/**
 * fldChar begin (dirty) → instrText → separate → cached run → end.
 *
 * The cached run between `separate` and `end` is left empty: Word replaces it
 * with the real entries on open (w:updateFields), and LibreOffice renders its
 * own generated index next to the field rather than this cache, so a
 * placeholder string here only adds a stray line to headless conversions.
 */
function fieldParagraph(spec: PackSpec): OrderedXmlNode {
  const run = (child: OrderedXmlNode) => createNode("w:r", undefined, [rPr(spec), child]);
  return createNode("w:p", undefined, [
    run(createNode("w:fldChar", { "w:fldCharType": "begin", "w:dirty": "true" })),
    run(createNode("w:instrText", { "xml:space": "preserve" }, [createTextNode(TOC_INSTR)])),
    run(createNode("w:fldChar", { "w:fldCharType": "separate" })),
    run(createNode("w:t", { "xml:space": "preserve" })),
    run(createNode("w:fldChar", { "w:fldCharType": "end" })),
  ]);
}

/** `<w:updateFields w:val="true"/>` at its CT_Settings position. */
async function setUpdateFields(pkg: DocxPackage, mainName: string): Promise<boolean> {
  const dir = dirOf(mainName);
  const name = `${dir ? `${dir}/` : ""}settings.xml`;
  if (!pkg.has(name)) return false;
  const nodes = await pkg.part(name);
  const root = nodes?.find((n) => "w:settings" in n);
  if (!root) return false;
  const existing = findChild(root, "w:updateFields");
  if (existing) {
    existing[":@"] = { ...(existing[":@"] ?? {}), "@_w:val": "true" };
  } else {
    setChildInOrder(root, "w:updateFields", createNode("w:updateFields", { "w:val": "true" }), W_SETTINGS_ORDER);
  }
  pkg.markDirty(name);
  return true;
}

/**
 * Whether the package already holds a table of contents, read before anything
 * is restyled.
 *
 * It has to be read first: the evidence is partly the paragraphs' own styles,
 * and a TOC style the classifier did not recognise gets overwritten by the
 * restyler — after which the document would look as if it never had one.
 */
export async function detectExistingToc(pkg: DocxPackage): Promise<boolean> {
  const part = await mainPart(pkg);
  return part ? hasExistingToc(part.nodes) : false;
}

export async function insertToc(
  pkg: DocxPackage,
  spec: PackSpec,
  roles: Map<OrderedXmlNode, string>,
  existing?: boolean
): Promise<TocResult> {
  const part = await mainPart(pkg);
  if (!part) return { inserted: false, existing: false, updateFields: false };
  // Only the document decides this. The classifier's `toc` role fires on a bare
  // "СОДЕРЖАНИЕ" heading too, and a heading with nothing under it is a promise
  // of a table of contents, not one.
  if (existing ?? hasExistingToc(part.nodes)) {
    return { inserted: false, existing: true, updateFields: false };
  }

  const end = titleRegionEnd(part, roles);
  if (typeof end !== "number") return { inserted: false, existing: false, updateFields: false, skipped: end };
  const at = end + 1;
  const id = nextBookmarkId(part.nodes);

  const heading = headingParagraph(spec);
  const field = fieldParagraph(spec);
  markAux(heading, "toc", 1, id);
  markAux(field, "toc", 2, id + 1);
  children(part.body).splice(at, 0, heading, field);
  pkg.markDirty(part.name);

  return { inserted: true, existing: false, updateFields: await setUpdateFields(pkg, part.name) };
}
