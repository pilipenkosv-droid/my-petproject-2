/**
 * Collapsing runs of spaces — the one step that touches text, and therefore
 * opt-in.
 *
 * The rule applies to `w:t` nodes of every role except `toc` and `formula`,
 * and only *within* one text node. Collapsing across runs would join words
 * whose separating space lives in a neighbouring run, and `w:instrText` /
 * `w:delText` are never candidates — they are different tags and the walk
 * simply does not reach them. `toc` is excluded because its cached run is
 * replaced by Word on open anyway, and `formula` because spacing there can be
 * meaningful (e.g. omml fallback text).
 *
 * The fingerprint already collapses whitespace runs (normalizeText), so this
 * mutation is invisible to the gate; `allowTextNormalization` is passed anyway
 * because that is what the change means, not because A4 has to rescue it.
 */

import { children, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { walkAll } from "../fingerprint/scan";
import type { ClassificationResult, Role } from "../classify/types";

const EXCLUDED_ROLES: ReadonlySet<Role> = new Set<Role>(["toc", "formula"]);

const RUNS_OF_SPACES = / {2,}/g;

/** Collapses inside one w:t, keeping xml:space where a space survives at an edge. */
function collapseTextNode(t: OrderedXmlNode): number {
  let collapsed = 0;
  for (const child of children(t)) {
    if (!("#text" in child)) continue;
    const before = String((child as Record<string, unknown>)["#text"]);
    const after = before.replace(RUNS_OF_SPACES, " ");
    if (after === before) continue;
    collapsed += before.match(RUNS_OF_SPACES)?.length ?? 0;
    (child as Record<string, unknown>)["#text"] = after;
    if (/^ | $/.test(after)) {
      t[":@"] = { ...(t[":@"] ?? {}), "@_xml:space": "preserve" };
    }
  }
  return collapsed;
}

/** Returns how many runs of spaces were collapsed across the document. */
export function normalizeSpaces(classification: ClassificationResult): number {
  let collapsed = 0;
  for (const cp of classification.list) {
    if (EXCLUDED_ROLES.has(cp.role)) continue;
    walkAll(cp.node, (node, tag) => {
      if (tag === "w:t") collapsed += collapseTextNode(node);
    });
  }
  return collapsed;
}
