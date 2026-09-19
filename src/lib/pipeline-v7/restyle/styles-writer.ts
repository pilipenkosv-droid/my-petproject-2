/**
 * Canonical styles in word/styles.xml.
 *
 * Two families are written. The Dpx* paragraph styles are ours: their pPr/rPr
 * are replaced wholesale on every run, which is what makes the writer
 * idempotent. The built-in Normal / Heading1..3 are the student's: only the
 * specific children we own are added or replaced, because Word's own TOC field
 * and outline view resolve through them and a rename would break both.
 *
 * Nothing is ever deleted or renamed here.
 */

import { children, createNode, getAttr, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { RulePack } from "@/lib/pipeline-v6/rule-packs/types";
import { normStyleName } from "../classify/styles";
import type { DocxPackage } from "../docx/package";
import type { Role } from "../classify/types";
import {
  W_PPR_ORDER,
  W_RPR_ORDER,
  W_STYLES_ORDER,
  W_STYLE_ORDER,
  ensureChildInOrder,
  setChildInOrder,
  setPropInOrder,
} from "./ooxml-order";
import { BODY_ALIGN, STYLE_IDS, buildPackSpec, type PackSpec } from "./spec";
import { applyParagraphVisual, applyRunVisual, roleVisual, type VisualSpec } from "./visual";

export const STYLES_PART = "word/styles.xml";

export interface StylesWriteResult {
  upserted: number;
  /** The package has no word/styles.xml; nothing was written. */
  missingPart: boolean;
}

interface CanonicalStyle {
  id: string;
  name: string;
  role: Role;
}

const CANONICAL: CanonicalStyle[] = [
  { id: STYLE_IDS.body, name: "Dpx Body", role: "body" },
  { id: STYLE_IDS.listItem, name: "Dpx List Item", role: "list_item" },
  { id: STYLE_IDS.heading(1), name: "Dpx Heading 1", role: "heading_L1" },
  { id: STYLE_IDS.heading(2), name: "Dpx Heading 2", role: "heading_L2" },
  { id: STYLE_IDS.heading(3), name: "Dpx Heading 3", role: "heading_L3" },
  { id: STYLE_IDS.caption, name: "Dpx Caption", role: "figure_caption" },
  { id: STYLE_IDS.tableCell, name: "Dpx Table Cell", role: "table_cell" },
  { id: STYLE_IDS.bibliography, name: "Dpx Bibliography", role: "bibliography_item" },
  { id: STYLE_IDS.tocTitle, name: "Dpx TOC Title", role: "heading_L1" },
  // A contents line: body text, flush left, no first-line indent — the
  // student's own tab stops and dot leaders carry the layout.
  { id: STYLE_IDS.tocEntry, name: "toc 1", role: "list_item" },
];

/** Built-in ids/names, in the spellings Word, LibreOffice and Google Docs use. */
const BUILTINS: { keys: string[]; role: Role | "normal" }[] = [
  { keys: ["normal", "обычный", "standard"], role: "normal" },
  { keys: ["heading1", "заголовок1"], role: "heading_L1" },
  { keys: ["heading2", "заголовок2"], role: "heading_L2" },
  { keys: ["heading3", "заголовок3"], role: "heading_L3" },
];

function styleNodes(root: OrderedXmlNode): OrderedXmlNode[] {
  return children(root).filter((c) => "w:style" in c);
}

function findByKeys(root: OrderedXmlNode, keys: string[]): OrderedXmlNode | undefined {
  return styleNodes(root).find((s) => {
    const id = normStyleName(getAttr(s, "w:styleId"));
    const nameNode = children(s).find((c) => "w:name" in c);
    const name = normStyleName(nameNode ? getAttr(nameNode, "w:val") : undefined);
    return keys.includes(id) || keys.includes(name);
  });
}

function appendStyle(root: OrderedXmlNode, id: string, name: string): OrderedXmlNode {
  const node = createNode("w:style", { "w:type": "paragraph", "w:styleId": id });
  setPropInOrder(node, "w:name", { "w:val": name }, W_STYLE_ORDER);
  setPropInOrder(node, "w:basedOn", { "w:val": "Normal" }, W_STYLE_ORDER);
  setPropInOrder(node, "w:qFormat", {}, W_STYLE_ORDER);
  children(root).push(node);
  return node;
}

function writeVisual(style: OrderedXmlNode, v: VisualSpec, spec: PackSpec, own: boolean): void {
  const pPr = own
    ? setChildInOrder(style, "w:pPr", createNode("w:pPr"), W_STYLE_ORDER)
    : ensureChildInOrder(style, "w:pPr", W_STYLE_ORDER);
  applyParagraphVisual(pPr, v);
  const rPr = own
    ? setChildInOrder(style, "w:rPr", createNode("w:rPr"), W_STYLE_ORDER)
    : ensureChildInOrder(style, "w:rPr", W_STYLE_ORDER);
  applyRunVisual(rPr, v, spec.font);
}

function writeDocDefaults(root: OrderedXmlNode, spec: PackSpec): void {
  const dd = ensureChildInOrder(root, "w:docDefaults", W_STYLES_ORDER);
  const order = ["w:rPrDefault", "w:pPrDefault"];
  const rPr = ensureChildInOrder(ensureChildInOrder(dd, "w:rPrDefault", order), "w:rPr", W_RPR_ORDER);
  const f = spec.font;
  setPropInOrder(rPr, "w:rFonts", { "w:ascii": f, "w:hAnsi": f, "w:cs": f, "w:eastAsia": f }, W_RPR_ORDER);
  setPropInOrder(rPr, "w:sz", { "w:val": String(spec.szBody) }, W_RPR_ORDER);
  setPropInOrder(rPr, "w:szCs", { "w:val": String(spec.szBody) }, W_RPR_ORDER);
  setPropInOrder(rPr, "w:lang", { "w:val": "ru-RU", "w:eastAsia": "ru-RU" }, W_RPR_ORDER);
  const pPr = ensureChildInOrder(ensureChildInOrder(dd, "w:pPrDefault", order), "w:pPr", W_PPR_ORDER);
  setPropInOrder(
    pPr,
    "w:spacing",
    { "w:after": "0", "w:line": String(spec.lineBody), "w:lineRule": "auto" },
    W_PPR_ORDER
  );
}

/** Creates/refreshes the Dpx* styles and aligns the built-ins with them. */
export async function upsertCanonicalStyles(
  pkg: DocxPackage,
  pack: RulePack
): Promise<StylesWriteResult> {
  const nodes = await pkg.part(STYLES_PART);
  const root = nodes?.find((n) => "w:styles" in n);
  if (!root) return { upserted: 0, missingPart: true };
  const spec = buildPackSpec(pack);
  writeDocDefaults(root, spec);

  let upserted = 0;
  for (const def of CANONICAL) {
    const v = roleVisual(def.role, spec);
    if (!v) continue;
    const style = findByKeys(root, [normStyleName(def.id)]) ?? appendStyle(root, def.id, def.name);
    const overrides: Partial<Record<string, typeof v>> = {
      [STYLE_IDS.tocTitle]: { ...v, jc: "center", pageBreakBefore: false },
      [STYLE_IDS.tocEntry]: { ...v, jc: "left" },
    };
    writeVisual(style, overrides[def.id] ?? v, spec, true);
    upserted += 1;
  }

  for (const b of BUILTINS) {
    const style = findByKeys(root, b.keys);
    if (!style) continue;
    const v =
      b.role === "normal"
        ? { ...roleVisual("body", spec)!, jc: BODY_ALIGN }
        : roleVisual(b.role, spec)!;
    writeVisual(style, v, spec, false);
    upserted += 1;
  }
  pkg.markDirty(STYLES_PART);
  return { upserted, missingPart: false };
}
