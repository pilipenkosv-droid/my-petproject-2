/**
 * Core types of pipeline-v7 — the in-place OOXML restyler.
 *
 * Principle: the document never leaves OOXML. A part is parsed once into a
 * preserve-order AST, mutated in place, and serialised once on save.
 */

import type { OrderedXmlNode } from "@/lib/xml/docx-xml";

export type PartName = string;

export type ContentPartKind =
  | "document"
  | "header"
  | "footer"
  | "footnotes"
  | "endnotes"
  | "comments";

export interface ContentPartRef {
  name: PartName;
  kind: ContentPartKind;
}

/** One block-level element yielded by walkBlocks. */
export interface BlockRef {
  kind: "p" | "tbl";
  node: OrderedXmlNode;
  /** The node whose children array directly contains `node`. */
  parent: OrderedXmlNode;
  /** Nesting depth in the element tree, counted from the part root. */
  depth: number;
  /** How many w:tbl ancestors the block has (0 = top level). */
  inTableDepth: number;
  /** Tag path from the part root down to and including the block. */
  path: string;
}

export interface PgMar {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  header?: string;
  footer?: string;
  gutter?: string;
}

export interface PgSz {
  w?: string;
  h?: string;
  orient?: string;
  code?: string;
}

export interface ColsInfo {
  num: number;
  equalWidth: boolean;
  space?: string;
}

export interface HeaderFooterRef {
  kind: "header" | "footer";
  /** w:type — default | even | first */
  type: string;
  relId: string;
}

/** A w:sectPr with the location it was found at. */
export interface SectPrRef {
  node: OrderedXmlNode;
  /** "body" = the final body-level sectPr; "pPr" = a paragraph-level one. */
  scope: "body" | "pPr";
  /** Owning w:p node when scope is "pPr". */
  paragraph?: OrderedXmlNode;
  path: string;
}
