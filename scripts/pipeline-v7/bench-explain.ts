/**
 * `--explain` for the v7 bench: why a checker rule failed, in structural terms.
 *
 * The checker's own `examples` quote the document, which the real corpus forbids
 * (see CLAUDE.md, golden corpus). This module re-derives the same failures from
 * the output package and reports only shape: paragraph index, role, run counts,
 * which tags are present, attribute values, container kind. Text is printed only
 * for the synthetic corpus, where it is ours.
 *
 * Paragraph enumeration mirrors the checker exactly
 * (`getParagraphsWithPositions` over the body), so the indices printed here are
 * the indices the checker's messages use.
 */

import {
  children,
  findChild,
  findChildren,
  getAttr,
  getAttrs,
  getBody,
  getParagraphsWithPositions,
  getText,
  tagName,
  type OrderedXmlNode,
} from "../../src/lib/xml/docx-xml";
import { DocxPackage } from "../../src/lib/pipeline-v7/docx/package";
import { classifyDocument } from "../../src/lib/pipeline-v7/classify/deterministic";
import { enumerateSectPr, getPgMar, getPgSz } from "../../src/lib/pipeline-v7/docx/sectpr";
import type { Role } from "../../src/lib/pipeline-v7/classify/types";
import { rulesFromPack } from "../../src/lib/pipeline-v6/orchestrator";
import { GOST_7_32 } from "../../src/lib/pipeline-v6/rule-packs/gost-7-32";

const DOCUMENT_PART = "word/document.xml";
const EMU_PER_TWIP = 635;
/** The checker's own drawing limit (165 mm), reported alongside the real one. */
const CHECKER_MAX_EMU = 165 * 36000;
const TWIPS_PER_MM = 56.7;

/** getAttr that tolerates a missing node, like the checker's own reader. */
function attr(node: OrderedXmlNode | undefined, name: string): string | undefined {
  return node ? getAttr(node, name) : undefined;
}

/** Run children that make a run structural rather than textual. */
const SPECIAL = new Set(["w:drawing", "w:pict", "w:object", "w:fldChar", "w:instrText"]);
const WRAPPERS = new Set(["w:hyperlink", "w:ins", "w:del", "w:smartTag"]);

export interface ExplainOpts {
  /** Synthetic corpus only: quoting the document is allowed. */
  safeText: boolean;
  /** Rule ids the checker reported as failed. */
  failed: string[];
}

/** One `w:t` of a paragraph, with where it sits and what precedes it. */
interface Segment {
  text: string;
  start: number;
  runIndex: number;
  container: string;
}

/** Walks a paragraph the way `getFullText` does, keeping per-w:t offsets. */
function segmentsOf(p: OrderedXmlNode): { segments: Segment[]; text: string } {
  const segments: Segment[] = [];
  let text = "";
  let runIndex = 0;
  const walk = (node: OrderedXmlNode, container: string): void => {
    for (const child of children(node)) {
      const tag = tagName(child);
      if (!tag) continue;
      if (tag === "w:r") {
        const idx = runIndex++;
        for (const t of findChildren(child, "w:t")) {
          const s = getText(t);
          segments.push({ text: s, start: text.length, runIndex: idx, container });
          text += s;
        }
      } else if (WRAPPERS.has(tag)) {
        walk(child, tag);
      }
    }
  };
  walk(p, "w:p");
  return { segments, text };
}

/** Which segments a [from, to) span of the paragraph text touches. */
function spanSegments(segments: Segment[], from: number, to: number): Segment[] {
  return segments.filter((s) => s.start < to && s.start + s.text.length > from);
}

function textKind(s: string): string {
  if (s.length === 0) return "empty";
  if (/^[\s ]+$/.test(s)) return "whitespace-only";
  if (/^[_\s ]+$/.test(s)) return "underscores-only";
  return "text";
}

function runFacts(run: OrderedXmlNode, container: string): string {
  const rPr = findChild(run, "w:rPr");
  const tags = children(run)
    .map((c) => tagName(c))
    .filter((t): t is string => t !== undefined);
  const special = tags.filter((t) => SPECIAL.has(t));
  const t = findChildren(run, "w:t").map((n) => getText(n)).join("");
  const del = findChildren(run, "w:delText").map((n) => getText(n)).join("");
  const parts = [
    `container=${container}`,
    `kind=${textKind(t)}`,
    `len=${t.length}`,
  ];
  if (del.length) parts.push(`delTextLen=${del.length}`);
  if (special.length) parts.push(`special=${special.join("+")}`);
  const u = rPr ? findChild(rPr, "w:u") : undefined;
  if (u) parts.push(`u.val=${getAttr(u, "w:val") ?? "(none)"}`);
  const color = rPr ? findChild(rPr, "w:color") : undefined;
  if (color) {
    const attrs = getAttrs(color);
    const extra = Object.keys(attrs).filter((k) => k !== "w:val");
    parts.push(`color.val=${attrs["w:val"] ?? "(none)"}`);
    if (extra.length) parts.push(`color.attrs=${extra.join("+")}`);
  }
  const hl = rPr ? findChild(rPr, "w:highlight") : undefined;
  if (hl) parts.push(`highlight=${getAttr(hl, "w:val") ?? "(none)"}`);
  return parts.join(" ");
}

/** The checker's `getRuns`: direct runs, then runs wrapped in hyperlink/ins/del. */
function checkerRuns(p: OrderedXmlNode): { run: OrderedXmlNode; container: string }[] {
  const out = findChildren(p, "w:r").map((run) => ({ run, container: "w:p" }));
  for (const tag of ["w:hyperlink", "w:ins", "w:del"]) {
    for (const wrapper of findChildren(p, tag)) {
      for (const run of findChildren(wrapper, "w:r")) out.push({ run, container: tag });
    }
  }
  return out;
}

function textWidthTwips(nodes: OrderedXmlNode[]): number {
  const sectPr = enumerateSectPr(nodes)[0]?.node;
  if (!sectPr) return 9638;
  const size = getPgSz(sectPr);
  const mar = getPgMar(sectPr);
  const w = Number(size?.w);
  const left = Number(mar?.left ?? 0);
  const right = Number(mar?.right ?? 0);
  const width = w - (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
  return Number.isFinite(width) && width > 0 ? width : 9638;
}

function quote(s: string, safe: boolean, max = 60): string {
  return safe ? ` "${s.slice(0, max).replace(/\s+/g, "·")}"` : "";
}

/**
 * Re-derives the structural cause of each failed rule from the output bytes.
 * Returns rule id → lines, at most a handful of lines per rule per document.
 */
export async function explainOutput(
  output: Buffer,
  opts: ExplainOpts
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const want = new Set(opts.failed);
  const push = (rule: string, line: string, cap = 6) => {
    const list = (out[rule] ??= []);
    if (list.length < cap) list.push(line);
    else if (list.length === cap) list.push("…");
  };

  const pkg = await DocxPackage.load(output);
  const nodes = await pkg.part(DOCUMENT_PART);
  const body = nodes ? getBody(nodes) : undefined;
  if (!nodes || !body) return out;

  // Roles come from the same package, so node identity matches the paragraphs
  // enumerated below; no index arithmetic is involved.
  let roleByNode = new Map<OrderedXmlNode, Role>();
  try {
    const cls = await classifyDocument(pkg);
    roleByNode = new Map(cls.list.map((cp) => [cp.node, cp.role]));
  } catch {
    /* role is a convenience; the structural facts stand without it */
  }

  const paragraphs = getParagraphsWithPositions(body);
  const safe = opts.safeText;

  for (const { node, paragraphIndex } of paragraphs) {
    const role = roleByNode.get(node) ?? "?";
    const at = `[p${paragraphIndex} role=${role}]`;

    if (want.has("text.multipleSpaces") || want.has("text.doubleDots")) {
      const { segments, text } = segmentsOf(node);
      const scan = (rule: string, re: RegExp) => {
        if (!want.has(rule)) return;
        for (const m of text.matchAll(re)) {
          const from = m.index ?? 0;
          const hit = spanSegments(segments, from, from + m[0].length);
          const runs = new Set(hit.map((s) => s.runIndex));
          const containers = new Set(hit.map((s) => s.container));
          push(
            rule,
            `${at} ${runs.size > 1 ? "CROSS-RUN" : "in-w:t"} runs=${[...runs].join(",")} ` +
              `tNodes=${hit.length} containers=${[...containers].join(",")} ` +
              `paraRuns=${segments.length}${quote(text.slice(Math.max(0, from - 15), from + 20), safe, 40)}`
          );
        }
      };
      scan("text.multipleSpaces", / {2,}/g);
      scan("text.doubleDots", /(?<!\.)\.\.(?!\.)/g);
    }

    if (want.has("text.noUnderline") || want.has("text.noColoredText")) {
      for (const { run, container } of checkerRuns(node)) {
        const rPr = findChild(run, "w:rPr");
        if (!rPr) continue;
        if (want.has("text.noUnderline") && findChild(rPr, "w:u")) {
          push("text.noUnderline", `${at} ${runFacts(run, container)}`);
        }
        if (want.has("text.noColoredText")) {
          const color = findChild(rPr, "w:color");
          const val = attr(color, "w:val");
          const hl = findChild(rPr, "w:highlight");
          const colored = val !== undefined && val !== "auto" && val !== "000000" && val !== "Auto";
          if (colored || hl) push("text.noColoredText", `${at} ${runFacts(run, container)}`);
        }
      }
    }
  }

  const textTw = textWidthTwips(nodes);
  const bodyChildren = children(body);
  const tables = bodyChildren.filter((n) => "w:tbl" in n);

  if (want.has("tables.width")) {
    // The checker's own threshold: the pack's margins, not the document's
    // section — a table can fit the page and still fail the rule.
    const m = rulesFromPack(GOST_7_32).margins;
    const pageWidthTw = Math.round((210 - m.left - m.right) * TWIPS_PER_MM);
    tables.forEach((tbl, i) => {
      const tblPr = findChild(tbl, "w:tblPr");
      const tblW = tblPr ? findChild(tblPr, "w:tblW") : undefined;
      const type = attr(tblW, "w:type");
      const val = Number(attr(tblW, "w:w"));
      const bad =
        (type === "pct" && val > 5000) || (type === "dxa" && val > pageWidthTw + 100);
      if (bad) {
        push(
          "tables.width",
          `[tbl ${i + 1}] tblW.type=${type} tblW.w=${val} ` +
            `sectionTextWidthTw=${textTw} checkerLimitTw=${pageWidthTw}`
        );
      }
    });
  }

  if (want.has("tables.emptyCellParagraphs")) {
    tables.forEach((tbl, ti) => {
      findChildren(tbl, "w:tr").forEach((row, ri) => {
        findChildren(row, "w:tc").forEach((cell, ci) => {
          const paras = findChildren(cell, "w:p");
          const empty = paras.filter((p) => !segmentsOf(p).text.trim());
          if (empty.length > 1) {
            const withBreaks = empty.filter((p) =>
              checkerRuns(p).some(({ run }) => findChild(run, "w:br") !== undefined)
            ).length;
            push(
              "tables.emptyCellParagraphs",
              `[tbl ${ti + 1} r${ri + 1} c${ci + 1}] paras=${paras.length} empty=${empty.length} ` +
                `excess=${empty.length - 1} emptyWithBr=${withBreaks}`
            );
          }
        });
      });
    });
  }

  if (want.has("images.noOverflow")) {
    const limitEmu = textTw * EMU_PER_TWIP;
    const visit = (node: OrderedXmlNode, ctx: string): void => {
      for (const child of children(node)) {
        if ("w:drawing" in child) {
          for (const container of [
            ...findChildren(child, "wp:inline"),
            ...findChildren(child, "wp:anchor"),
          ]) {
            const extent = findChild(container, "wp:extent");
            const cx = Number(attr(extent, "cx"));
            const cy = Number(attr(extent, "cy"));
            if (Number.isFinite(cx) && cx > CHECKER_MAX_EMU) {
              push(
                "images.noOverflow",
                `${ctx} kind=${tagName(container)} cx=${cx} cy=${cy} ` +
                  `checkerLimitEmu=${CHECKER_MAX_EMU} sectionTextWidthEmu=${limitEmu} ` +
                  `needScale=${(limitEmu / cx).toFixed(3)}`
              );
            }
          }
        } else if ("w:r" in child || "w:p" in child || WRAPPERS.has(tagName(child) ?? "")) {
          visit(child, ctx);
        }
      }
    };
    for (const { node, paragraphIndex } of paragraphs) visit(node, `[p${paragraphIndex}]`);
  }

  if (want.has("structure.tocNoGarbage") || want.has("structure.tocFieldCode") || want.has("structure.tocHeading")) {
    const tocParas = paragraphs.filter(({ node }) => roleByNode.get(node) === "toc");
    const hasField = paragraphs.some(({ node }) =>
      checkerRuns(node).some(({ run }) =>
        findChildren(run, "w:instrText").some((t) => /\bTOC\b/.test(getText(t)))
      )
    );
    push(
      "structure.tocNoGarbage",
      `tocParas=${tocParas.length} instrTextTOC=${hasField} ` +
        `longest=${Math.max(0, ...tocParas.map(({ node }) => segmentsOf(node).text.length))}`
    );
    for (const rule of ["structure.tocFieldCode", "structure.tocHeading"]) {
      if (want.has(rule)) push(rule, `tocParas=${tocParas.length} instrTextTOC=${hasField}`);
    }
  }

  return out;
}
