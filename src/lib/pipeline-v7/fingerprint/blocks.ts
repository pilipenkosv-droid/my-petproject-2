/**
 * Block prints: the ordered spine of the fingerprint.
 *
 * Blocks come from walkBlocks, so every paragraph and table is seen once,
 * wherever it is buried. Alongside the content each block carries the metadata
 * the gate's allowances need (pStyle, aux ranges, TOC membership, own markers).
 */

import { children, getAttr, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { walkBlocks, paragraphText } from "../docx/walk";
import { normalizeText, normalizeInstr, auxKind } from "./normalize";
import { elementText, ownMarkers, walkOwn } from "./scan";
import type { BlockPrint, TableShape } from "./types";

type Event =
  | { t: "bmStart"; name: string; id: string }
  | { t: "bmEnd"; id: string }
  | { t: "fldBegin" }
  | { t: "fldEnd" }
  | { t: "instr"; text: string };

interface ParagraphScan {
  pStyle?: string;
  hasDrawing: boolean;
  hasEmbed: boolean;
  hasSectPr: boolean;
  hasAnchor: boolean;
  hasFootnoteRef: boolean;
  footnoteIds: string[];
  events: Event[];
}

const ANCHORS = new Set(["w:bookmarkStart", "w:commentRangeStart", "w:commentReference"]);

function scanParagraph(node: OrderedXmlNode): ParagraphScan {
  const s: ParagraphScan = {
    hasDrawing: false,
    hasEmbed: false,
    hasSectPr: false,
    hasAnchor: false,
    hasFootnoteRef: false,
    footnoteIds: [],
    events: [],
  };
  let instrBuffer = "";
  const flush = () => {
    if (instrBuffer.trim()) s.events.push({ t: "instr", text: instrBuffer });
    instrBuffer = "";
  };
  walkOwn(node, (n, tag) => {
    if (tag === "w:pStyle" && s.pStyle === undefined) s.pStyle = getAttr(n, "w:val");
    else if (tag === "w:drawing" || tag === "w:pict") s.hasDrawing = true;
    else if (tag === "w:object" || tag === "m:oMath") s.hasEmbed = true;
    else if (tag === "w:sectPr") s.hasSectPr = true;
    else if (tag === "w:footnoteReference") {
      s.hasFootnoteRef = true;
      const id = getAttr(n, "w:id");
      if (id) s.footnoteIds.push(id);
    } else if (tag === "w:endnoteReference") s.hasFootnoteRef = true;
    else if (tag === "w:bookmarkStart") {
      const name = getAttr(n, "w:name") ?? "";
      s.events.push({ t: "bmStart", name, id: getAttr(n, "w:id") ?? name });
    } else if (tag === "w:bookmarkEnd") s.events.push({ t: "bmEnd", id: getAttr(n, "w:id") ?? "" });
    else if (tag === "w:instrText") {
      instrBuffer += elementText(n);
      return;
    } else if (tag === "w:fldChar") {
      flush();
      const type = getAttr(n, "w:fldCharType");
      if (type === "begin") s.events.push({ t: "fldBegin" });
      else if (type === "end") s.events.push({ t: "fldEnd" });
      return;
    } else if (tag === "w:fldSimple") {
      s.events.push({ t: "instr", text: getAttr(n, "w:instr") ?? "" });
    }
    if (ANCHORS.has(tag)) s.hasAnchor = true;
  });
  flush();
  return s;
}

function rowsOf(tbl: OrderedXmlNode): OrderedXmlNode[] {
  const out: OrderedXmlNode[] = [];
  for (const child of children(tbl)) {
    const tag = tagName(child);
    if (tag === "w:tr") out.push(child);
    else if (tag === "w:sdt" || tag === "w:customXml") out.push(...rowsOf(child));
    else if (tag === "w:sdtContent") out.push(...rowsOf(child));
  }
  return out;
}

function cellShape(tc: OrderedXmlNode): { gridSpan: number; vMerge: "restart" | "continue" | null } {
  const tcPr = children(tc).find((c) => "w:tcPr" in c);
  const props = tcPr ? children(tcPr) : [];
  const span = props.find((c) => "w:gridSpan" in c);
  const merge = props.find((c) => "w:vMerge" in c);
  return {
    gridSpan: span ? Number(getAttr(span, "w:val") ?? 1) || 1 : 1,
    vMerge: merge ? (getAttr(merge, "w:val") === "restart" ? "restart" : "continue") : null,
  };
}

export function tableShape(tbl: OrderedXmlNode): TableShape {
  const grid = children(tbl).find((c) => "w:tblGrid" in c);
  const gridCols = grid ? children(grid).filter((c) => "w:gridCol" in c).length : 0;
  const rows = rowsOf(tbl).map((tr) => ({
    cells: children(tr)
      .filter((c) => "w:tc" in c)
      .map(cellShape),
  }));
  return { gridCols, rows };
}

/** Tracks aux bookmark ranges and TOC field ranges across the block sequence. */
class RangeState {
  private readonly open = new Map<string, string>();
  private readonly fields: { isToc: boolean; decided: boolean }[] = [];

  apply(events: Event[]): { auxRanges: string[]; inTocField: boolean } {
    const covering = new Set(this.open.values());
    let inToc = this.fields.some((f) => f.isToc);
    const closing: string[] = [];
    for (const ev of events) {
      if (ev.t === "bmStart") {
        if (auxKind(ev.name)) {
          this.open.set(ev.id, ev.name);
          covering.add(ev.name);
        }
      } else if (ev.t === "bmEnd") {
        if (this.open.has(ev.id)) closing.push(ev.id);
      } else if (ev.t === "fldBegin") this.fields.push({ isToc: false, decided: false });
      else if (ev.t === "fldEnd") this.fields.pop();
      else if (ev.t === "instr") {
        const top = this.fields[this.fields.length - 1];
        if (top && !top.decided) {
          top.decided = true;
          top.isToc = normalizeInstr(ev.text) === "TOC";
        }
      }
      inToc = inToc || this.fields.some((f) => f.isToc);
    }
    for (const id of closing) this.open.delete(id);
    return { auxRanges: [...covering].sort(), inTocField: inToc };
  }
}

function onlyInCell(parent: OrderedXmlNode): boolean {
  return tagName(parent) === "w:tc" && children(parent).filter((c) => "w:p" in c).length === 1;
}

/** Every w:p and w:tbl of a part, in document order, with gate metadata. */
export function buildBlocks(nodes: OrderedXmlNode[]): BlockPrint[] {
  const state = new RangeState();
  const out: BlockPrint[] = [];
  for (const ref of walkBlocks(nodes)) {
    const markers = ownMarkers(ref.node);
    if (ref.kind === "tbl") {
      const { auxRanges, inTocField } = state.apply([]);
      out.push({
        kind: "tbl",
        depth: ref.inTableDepth,
        shape: tableShape(ref.node),
        path: ref.path,
        markers,
        auxRanges,
        inTocField,
        fields: [],
        bookmarkNames: [],
      });
      continue;
    }
    const s = scanParagraph(ref.node);
    const { auxRanges, inTocField } = state.apply(s.events);
    out.push({
      kind: "p",
      text: normalizeText(paragraphText(ref.node)),
      inTableDepth: ref.inTableDepth,
      hasDrawing: s.hasDrawing,
      hasFootnoteRef: s.hasFootnoteRef,
      footnoteIds: s.footnoteIds,
      path: ref.path,
      pStyle: s.pStyle,
      markers,
      auxRanges,
      inTocField,
      fields: s.events.flatMap((e) => (e.t === "instr" ? [normalizeInstr(e.text)] : [])).filter(Boolean),
      bookmarkNames: s.events.flatMap((e) => (e.t === "bmStart" && e.name ? [e.name] : [])),
      hasEmbed: s.hasEmbed,
      hasSectPr: s.hasSectPr,
      hasAnchor: s.hasAnchor,
      onlyInCell: onlyInCell(ref.parent),
    });
  }
  const last = out[out.length - 1];
  if (last?.kind === "p" && last.inTableDepth === 0) last.lastBody = true;
  return out;
}
