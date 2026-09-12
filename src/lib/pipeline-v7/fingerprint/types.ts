/**
 * Fidelity fingerprint types.
 *
 * A fingerprint is everything about a .docx that a restyler must NOT change:
 * block sequence, text, structural marker counts, table shapes, field
 * instructions, bookmarks, section layout, media and relationship targets.
 * Everything a restyler is allowed to touch (pPr/rPr, styles.xml, numbering,
 * rsids, page margins) is deliberately absent.
 */

export const MARKERS = [
  "w:tbl",
  "w:tr",
  "w:tc",
  "w:drawing",
  "w:pict",
  "w:object",
  "m:oMath",
  "w:footnoteReference",
  "w:endnoteReference",
  "w:hyperlink",
  "w:fldSimple",
  "w:instrText",
  "w:fldChar[begin]",
  "w:numPr",
  "w:commentReference",
  "w:bookmarkStart",
  "w:ins",
  "w:del",
  "w:sdt",
  "w:br[page]",
  "w:sectPr",
] as const;

export type Marker = (typeof MARKERS)[number];

export type MarkerCounts = Record<Marker, number>;

export interface TableShape {
  /** Number of w:gridCol in w:tblGrid — count only, widths are not fidelity. */
  gridCols: number;
  rows: { cells: { gridSpan: number; vMerge: "restart" | "continue" | null }[] }[];
}

export interface SectionPrint {
  orient: "portrait" | "landscape";
  colsNum: number;
  colsEqualWidth: boolean;
  type: string | null;
  headerRefTypes: string[];
  footerRefTypes: string[];
  titlePg: boolean;
}

/** Per-block gate metadata: never content, only what an allowance must judge. */
export interface BlockMeta {
  /** w:pStyle/@w:val of the paragraph, if any. */
  pStyle?: string;
  /** Markers contained by this block alone (nested blocks excluded). */
  markers?: Partial<Record<Marker, number>>;
  /** Names of open `_dpx_aux_<kind>_<n>` bookmark ranges covering this block. */
  auxRanges?: string[];
  /** The block lies inside a TOC field range. */
  inTocField?: boolean;
  /** Normalised field instructions the block itself carries. */
  fields?: string[];
  /** Bookmark names defined inside the block itself. */
  bookmarkNames?: string[];
  /** Has a w:drawing / w:pict / w:object / m:oMath of its own. */
  hasEmbed?: boolean;
  /** Carries a w:sectPr in its w:pPr. */
  hasSectPr?: boolean;
  /** Carries a bookmarkStart / commentRangeStart / commentReference. */
  hasAnchor?: boolean;
  /** Is the only w:p of its w:tc. */
  onlyInCell?: boolean;
  /** Is the last top-level paragraph of the part. */
  lastBody?: boolean;
}

export type BlockPrint =
  | ({
      kind: "p";
      text: string;
      inTableDepth: number;
      hasDrawing: boolean;
      hasFootnoteRef: boolean;
      footnoteIds: string[];
      path: string;
    } & BlockMeta)
  | ({ kind: "tbl"; depth: number; shape: TableShape; path: string } & BlockMeta);

export interface PartPrint {
  blocks: BlockPrint[];
  counts: MarkerCounts;
  tableShapes: TableShape[];
  fieldInstrs: string[];
  bookmarks: string[];
  sections: SectionPrint[];
}

export interface PackagePrint {
  /** "name:bytes", sorted. */
  mediaFiles: string[];
  /** "rels-part|target", sorted; relationship ids are excluded by design. */
  relTargets: string[];
  embeddedObjects: number;
}

export interface Fingerprint {
  version: 1;
  parts: Record<string, PartPrint>;
  packageLevel: PackagePrint;
}

export function emptyCounts(): MarkerCounts {
  const out = {} as MarkerCounts;
  for (const m of MARKERS) out[m] = 0;
  return out;
}
