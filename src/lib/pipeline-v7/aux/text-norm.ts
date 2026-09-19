/**
 * The two text repairs — collapsing runs of spaces and doubled full stops —
 * and the only step that touches text, which is why it is opt-in.
 *
 * Both work on the paragraph's joined text rather than on one `w:t`, because
 * that is what the checker reads (`getFullText`): a document written in Word
 * splits a sentence across runs at every spell-check or formatting boundary,
 * so the second space of a pair routinely lives in the next run. Matching the
 * checker's view of the paragraph is the whole point — a fix that only looks
 * inside a single node left most of the real corpus untouched.
 *
 * What is never rewritten, even when it sits inside the joined text: hyperlink
 * display text, deleted text, and field runs (`w:instrText` / `w:fldChar`).
 * Those either belong to another author's edit or are code Word re-evaluates,
 * and a space removed there is a broken field, not a cleaner sentence. They
 * still *count* toward the offsets, so the paragraph text this module sees is
 * exactly the checker's.
 *
 * Roles `toc` and `formula` are skipped whole: a TOC's cached run is replaced
 * by Word on open anyway, and spacing inside a formula can be meaningful.
 *
 * Fidelity: space collapsing is invisible to the fingerprint (`normalizeText`
 * there already collapses whitespace runs). Dropping a doubled dot is not — it
 * goes through the A4 allowance, which `looseForm` covers explicitly.
 */

import { children, findChildren, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { ClassificationResult, Role } from "../classify/types";

const EXCLUDED_ROLES: ReadonlySet<Role> = new Set<Role>(["toc", "formula"]);

/** Containers whose text the checker's `getFullText` folds into the paragraph. */
const WRAPPERS = new Set(["w:hyperlink", "w:ins", "w:del", "w:smartTag"]);
/** …of which these are read but never rewritten. */
const READ_ONLY_WRAPPERS = new Set(["w:hyperlink", "w:del"]);
/** A run holding either of these is a field: its text is code. */
const FIELD_CHILDREN = new Set(["w:instrText", "w:fldChar"]);

const RUNS_OF_SPACES = / {2,}/g;
/** Exactly two dots — `...` and an ellipsis are legitimate and must survive. */
const DOUBLE_DOT = /(?<!\.)\.\.(?!\.)/g;

/** One `#text` node of one `w:t`, placed on the paragraph's joined text. */
interface Segment {
  holder: Record<string, unknown>;
  t: OrderedXmlNode;
  start: number;
  text: string;
  /** False for hyperlink, deleted and field text: counted, never rewritten. */
  writable: boolean;
}

/** The paragraph as the checker reads it, with every `w:t` still addressable. */
function segmentsOf(p: OrderedXmlNode): { segments: Segment[]; text: string } {
  const segments: Segment[] = [];
  let text = "";
  const walk = (node: OrderedXmlNode, writable: boolean): void => {
    for (const child of children(node)) {
      const tag = tagName(child);
      if (!tag) continue;
      if (tag === "w:r") {
        const field = children(child).some((c) => {
          const t = tagName(c);
          return t !== undefined && FIELD_CHILDREN.has(t);
        });
        // In document order, so a break or a tab lands between the text around
        // it. Without them a space before a `w:br` and a space after it read as
        // one run of two spaces, and collapsing that eats the indent of the
        // next line. The checker's own getFullText drops breaks and therefore
        // does see a pair there; this walk deliberately does not follow it.
        for (const kid of children(child)) {
          const kidTag = tagName(kid);
          if (kidTag === "w:br" || kidTag === "w:cr") text += "\n";
          else if (kidTag === "w:tab") text += "\t";
          else if (kidTag === "w:t") {
            for (const holder of children(kid)) {
              if (!("#text" in holder)) continue;
              const record = holder as unknown as Record<string, unknown>;
              const s = String(record["#text"]);
              segments.push({
                holder: record,
                t: kid,
                start: text.length,
                text: s,
                writable: writable && !field,
              });
              text += s;
            }
          }
        }
      } else if (WRAPPERS.has(tag)) {
        walk(child, writable && !READ_ONLY_WRAPPERS.has(tag));
      }
    }
  };
  walk(p, true);
  return { segments, text };
}

/** Absolute offsets of the characters each match contributes for removal. */
function offsetsToDrop(text: string, re: RegExp): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    // One of the run survives: the first space, the first dot.
    for (let i = 1; i < m[0].length; i++) out.push(at + i);
  }
  return out;
}

/**
 * Deletes the given absolute offsets from the writable segments, back to front
 * so earlier offsets stay valid. Offsets inside a read-only segment are left in
 * place — a half-fixed paragraph is better than a broken field.
 */
function dropOffsets(segments: Segment[], offsets: number[]): void {
  if (!offsets.length) return;
  const wanted = new Set(offsets);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!seg.writable) continue;
    const local: number[] = [];
    for (let k = seg.text.length - 1; k >= 0; k--) {
      if (wanted.has(seg.start + k)) local.push(k);
    }
    if (!local.length) continue;
    let out = seg.text;
    for (const k of local) out = out.slice(0, k) + out.slice(k + 1);
    seg.holder["#text"] = out;
    seg.text = out;
    // A surviving edge space only stays a space if the node says so.
    if (/^ | $/.test(out)) {
      seg.t[":@"] = { ...(seg.t[":@"] ?? {}), "@_xml:space": "preserve" };
    }
  }
}

export interface TextNormStats {
  /** Runs of spaces collapsed to one. */
  spacesCollapsed: number;
  /** Doubled full stops reduced to one. */
  doubleDotsFixed: number;
}

/**
 * Collapses space runs and doubled dots across every eligible paragraph.
 *
 * Idempotent: after one pass no writable part of a paragraph's joined text
 * still matches either pattern, so a second pass finds nothing to drop.
 */
export function normalizeText(classification: ClassificationResult): TextNormStats {
  const stats: TextNormStats = { spacesCollapsed: 0, doubleDotsFixed: 0 };
  for (const cp of classification.list) {
    if (EXCLUDED_ROLES.has(cp.role)) continue;
    const { segments, text } = segmentsOf(cp.node);
    if (!segments.length) continue;
    const spaces = offsetsToDrop(text, RUNS_OF_SPACES);
    const dots = offsetsToDrop(text, DOUBLE_DOT);
    if (!spaces.length && !dots.length) continue;
    stats.spacesCollapsed += text.match(RUNS_OF_SPACES)?.length ?? 0;
    stats.doubleDotsFixed += text.match(DOUBLE_DOT)?.length ?? 0;
    dropOffsets(segments, [...spaces, ...dots]);
  }
  return stats;
}
