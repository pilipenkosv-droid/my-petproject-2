/**
 * Per-paragraph formatting facts used by the T0 rules and by the LLM
 * candidate filter. Reading them once per paragraph keeps the rule functions
 * free of XML traversal.
 */

import { children, findChild, getAttr, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";

export interface ParagraphFeatures {
  styleId?: string;
  /** w:pPr/w:outlineLvl, 0-based as stored. */
  outlineLvl?: number;
  numPr?: { numId?: string; ilvl: number };
  jc?: string;
  keepNext: boolean;
  pageBreakBefore: boolean;
  /** An explicit <w:br w:type="page"/> inside the paragraph. */
  hasPageBreakRun: boolean;
  /** Every text-bearing run is bold (false when the paragraph has no runs). */
  boldAll: boolean;
  /** Uppercase letters / all letters, 0 when the paragraph has no letters. */
  capsRatio: number;
  /** Most common w:sz among runs, in half-points. */
  sz?: number;
  hasMath: boolean;
  hasDrawing: boolean;
}

const RUN_WRAPPERS = new Set(["w:hyperlink", "w:ins", "w:smartTag", "w:fldSimple", "w:customXml"]);
const DRAWING_TAGS = new Set(["w:drawing", "w:pict", "w:object", "mc:AlternateContent"]);

function isOn(node: OrderedXmlNode | undefined): boolean {
  if (!node) return false;
  const val = getAttr(node, "w:val");
  return val === undefined || !(val === "0" || val === "false" || val === "off");
}

interface RunScan {
  runs: number;
  bold: number;
  sizes: number[];
  hasMath: boolean;
  hasDrawing: boolean;
  hasPageBreakRun: boolean;
}

function scanNode(node: OrderedXmlNode, acc: RunScan): void {
  for (const child of children(node)) {
    const tag = tagName(child);
    if (!tag) continue;
    if (tag === "m:oMath" || tag === "m:oMathPara") {
      acc.hasMath = true;
      continue;
    }
    if (tag === "w:object") {
      acc.hasDrawing = true;
      if (hasEquationObject(child)) acc.hasMath = true;
      continue;
    }
    if (DRAWING_TAGS.has(tag)) {
      acc.hasDrawing = true;
      continue;
    }
    if (tag === "w:r") {
      scanRun(child, acc);
      continue;
    }
    if (RUN_WRAPPERS.has(tag)) scanNode(child, acc);
  }
}

function scanRun(run: OrderedXmlNode, acc: RunScan): void {
  let hasText = false;
  for (const child of children(run)) {
    const tag = tagName(child);
    if (tag === "w:t") hasText = true;
    else if (tag === "w:br" && getAttr(child, "w:type") === "page") acc.hasPageBreakRun = true;
    else if (tag === "w:drawing" || tag === "w:pict" || tag === "w:object") acc.hasDrawing = true;
  }
  if (!hasText) return;
  acc.runs += 1;
  const rPr = findChild(run, "w:rPr");
  if (rPr && isOn(findChild(rPr, "w:b"))) acc.bold += 1;
  const szNode = rPr ? findChild(rPr, "w:sz") : undefined;
  const sz = szNode ? Number(getAttr(szNode, "w:val")) : NaN;
  if (Number.isFinite(sz)) acc.sizes.push(sz);
}

function hasEquationObject(node: OrderedXmlNode): boolean {
  for (const child of children(node)) {
    const progId = getAttr(child, "ProgID") ?? getAttr(child, "o:ProgID");
    if (progId && /equation/i.test(progId)) return true;
    if (hasEquationObject(child)) return true;
  }
  return false;
}

function modal(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  for (const [v, c] of counts) if (c > (counts.get(best) ?? 0)) best = v;
  return best;
}

export function capsRatio(text: string): number {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return 0;
  const upper = text.match(/\p{Lu}/gu)?.length ?? 0;
  return upper / letters.length;
}

export function paragraphFeatures(pNode: OrderedXmlNode, text: string): ParagraphFeatures {
  const pPr = findChild(pNode, "w:pPr");
  const acc: RunScan = { runs: 0, bold: 0, sizes: [], hasMath: false, hasDrawing: false, hasPageBreakRun: false };
  scanNode(pNode, acc);
  const outlineNode = pPr ? findChild(pPr, "w:outlineLvl") : undefined;
  const outlineRaw = outlineNode ? getAttr(outlineNode, "w:val") : undefined;
  const jcNode = pPr ? findChild(pPr, "w:jc") : undefined;
  const styleNode = pPr ? findChild(pPr, "w:pStyle") : undefined;
  return {
    styleId: styleNode ? getAttr(styleNode, "w:val") : undefined,
    outlineLvl: outlineRaw === undefined || outlineRaw === "" ? undefined : Number(outlineRaw),
    numPr: readNumPr(pPr),
    jc: jcNode ? getAttr(jcNode, "w:val") : undefined,
    keepNext: !!pPr && isOn(findChild(pPr, "w:keepNext")) && !!findChild(pPr, "w:keepNext"),
    pageBreakBefore: !!pPr && !!findChild(pPr, "w:pageBreakBefore") && isOn(findChild(pPr, "w:pageBreakBefore")),
    hasPageBreakRun: acc.hasPageBreakRun,
    boldAll: acc.runs > 0 && acc.bold === acc.runs,
    capsRatio: capsRatio(text),
    sz: modal(acc.sizes),
    hasMath: acc.hasMath,
    hasDrawing: acc.hasDrawing,
  };
}

function readNumPr(pPr: OrderedXmlNode | undefined): ParagraphFeatures["numPr"] {
  const numPr = pPr ? findChild(pPr, "w:numPr") : undefined;
  if (!numPr) return undefined;
  const numIdNode = findChild(numPr, "w:numId");
  const ilvlNode = findChild(numPr, "w:ilvl");
  const numId = numIdNode ? getAttr(numIdNode, "w:val") : undefined;
  // numId 0 means "numbering removed" — the paragraph is not a list item.
  if (numId === "0") return undefined;
  const ilvl = ilvlNode ? Number(getAttr(ilvlNode, "w:val") ?? "0") : 0;
  return { numId, ilvl: Number.isFinite(ilvl) ? ilvl : 0 };
}
