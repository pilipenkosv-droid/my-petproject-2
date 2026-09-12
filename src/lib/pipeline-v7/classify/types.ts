/**
 * Types of the T0 deterministic classification layer.
 *
 * T0 answers "what structural role does this paragraph play" using only facts
 * present in the OOXML: outline levels, style cascade, numbering, position,
 * and a small set of ГОСТ-shaped text patterns. Everything it cannot decide
 * stays `unknown` — a later LLM residue layer fills those in, so
 * ClassifiedParagraph carries optional slots for it (`llm`) rather than
 * forcing T0 to guess.
 */

import type { OrderedXmlNode } from "@/lib/xml/docx-xml";
import type { ParagraphFeatures } from "./features";

export type Role =
  | "title_page"
  | "toc"
  | "heading_L1"
  | "heading_L2"
  | "heading_L3"
  | "body"
  | "list_item"
  | "table_cell"
  | "figure_caption"
  | "table_caption"
  | "formula"
  | "bibliography_item"
  | "appendix_heading"
  | "note"
  | "header_footer"
  | "empty"
  | "unknown";

export const ROLES: Role[] = [
  "title_page",
  "toc",
  "heading_L1",
  "heading_L2",
  "heading_L3",
  "body",
  "list_item",
  "table_cell",
  "figure_caption",
  "table_caption",
  "formula",
  "bibliography_item",
  "appendix_heading",
  "note",
  "header_footer",
  "empty",
  "unknown",
];

/** Which rule produced the role. `none` = nothing fired (role stays unknown). */
export type ClassifySource =
  | "outlineLvl"
  | "style"
  | "numPr"
  | "position"
  | "caption-re"
  | "section-re"
  | "numbered-re"
  | "region"
  | "titlepage"
  | "omath"
  | "empty"
  | "llm"
  | "none";

/** Verdict for one w:p, keyed elsewhere by node identity. */
export interface ClassifiedParagraph {
  node: OrderedXmlNode;
  path: string;
  /** Part name the paragraph lives in, e.g. "word/document.xml". */
  part: string;
  role: Role;
  confidence: number;
  source: ClassifySource;
  text?: string;
  /** Paragraph carries m:oMath but was classified as something else. */
  hasInlineMath?: boolean;
  features?: ParagraphFeatures;
  /** Reserved for the later LLM residue layer; T0 never writes it. */
  llm?: { role?: Role; confidence?: number; rationale?: string };
}

export interface ClassificationResult {
  byNode: WeakMap<OrderedXmlNode, ClassifiedParagraph>;
  list: ClassifiedParagraph[];
  histogram: Record<Role, number>;
  warnings: string[];
  suspect: boolean;
  /** Most common run size (half-points) over non-heading paragraphs. */
  modalBodySize?: number;
}

export function emptyHistogram(): Record<Role, number> {
  return Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
}

export function isHeadingRole(role: Role): role is "heading_L1" | "heading_L2" | "heading_L3" {
  return role === "heading_L1" || role === "heading_L2" || role === "heading_L3";
}

export function headingRole(level: number): Role {
  return (`heading_L${Math.min(Math.max(level, 1), 3)}`) as Role;
}
